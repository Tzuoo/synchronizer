import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../RuntimeData/同步器擴充功能/background.js', import.meta.url), 'utf8');
const syncSource = await readFile(new URL('../../RuntimeData/同步器擴充功能/src/content/sync.js', import.meta.url), 'utf8');
const timeoutHelpers = source.slice(source.indexOf('const REQUEST_TIMEOUT_MS'), source.indexOf('let localPreviewRefreshPromise'));
const helpers = timeoutHelpers + source.slice(source.indexOf('let snapshotStorageQueue'), source.indexOf('async function getInstallationId'));
const clone = value => JSON.parse(JSON.stringify(value));
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function setup(initial = {}) {
  let storage = clone(initial), failWrite = false;
  const requests = [];
  const context = vm.createContext({
    DASHBOARD: 'https://test.invalid', Intl, AbortController, DOMException, setTimeout, clearTimeout, URL,
    chrome: { storage: { local: {
      async get() { const snapshot = clone(storage); await new Promise(resolve => setImmediate(resolve)); return snapshot; },
      async set(value) { await new Promise(resolve => setImmediate(resolve)); if (failWrite) { failWrite = false; throw new Error('write failed'); } Object.assign(storage, clone(value)); }
    }}},
    fetch: async (url, options) => { requests.push(clone(JSON.parse(options.body))); return { ok: true, json: async () => ({}) }; }
  });
  vm.runInContext(helpers, context);
  return { context, requests, get storage() { return storage; }, failNextWrite() { failWrite = true; } };
}

test('同時保存不同網站學習及總帳，只保留今日同鍵快照', async () => {
  const fixture = setup({ learnedDetailRequests: { old: { body: 'keep' } }, ledgerSnapshots: [{ id: 'old', date: today, totalAmount: 7 }, { id: 'yesterday', date: '2020-01-01', totalAmount: 9 }] });
  const a = { root: 'vs968.net', body: 'source-a' }, b = { root: 'kd998.net', body: 'source-b' };
  await Promise.all([
    fixture.context.saveLearnedRequest(a.root, a), fixture.context.saveLearnedRequest(b.root, b),
    fixture.context.saveLedgerSnapshot([{ id: 'a', date: today, playType: '台號', totalAmount: 400 }], 'vs968.net'),
    fixture.context.saveLedgerSnapshot([{ id: 'b', date: today, playType: '正碼', totalAmount: 760 }], 'kd998.net'),
    fixture.context.saveLedgerSnapshot([{ id: 'a', date: today, playType: '台號', totalAmount: 800 }], 'vs968.net')
  ]);
  assert.equal(fixture.storage.learnedDetailRequests.old.body, 'keep');
  assert.equal(fixture.storage.learnedDetailRequests[a.root].body, a.body);
  assert.equal(fixture.storage.learnedDetailRequests[b.root].body, b.body);
  assert.deepEqual(fixture.storage.ledgerSnapshots, [{ id: 'old', date: today, totalAmount: 7 }, { id: 'a', date: today, playType: '台號', totalAmount: 800 }, { id: 'b', date: today, playType: '正碼', totalAmount: 760 }]);
});

test('舊日與缺日期快照永久移除，但學習資料不變', async () => {
  const fixture = setup({ learnedDetailRequests: { keep: { body: 'learned' } }, ledgerSnapshots: [
    { id: 'old', date: '2020-01-01' }, { id: 'missing' }, { id: 'today', date: today }
  ] });
  await fixture.context.saveLedgerSnapshot([{ id: 'replay', date: '2020-01-01' }], 'vs968.net');
  assert.deepEqual(fixture.storage.ledgerSnapshots, [{ id: 'today', date: today }]);
  assert.equal(fixture.storage.learnedDetailRequests.keep.body, 'learned');
});

test('儲存失敗不阻塞後續工作，原資料保留且可重新保存', async () => {
  const fixture = setup({ learnedDetailRequests: { old: { body: 'keep' } } });
  fixture.failNextWrite();
  const failed = fixture.context.saveLearnedRequest('a', { body: 'a' });
  const next = fixture.context.saveLearnedRequest('b', { body: 'b' });
  await assert.rejects(failed, /write failed/);
  await next;
  await fixture.context.saveLearnedRequest('a', { body: 'a' });
  assert.deepEqual(Object.keys(fixture.storage.learnedDetailRequests).sort(), ['a', 'b', 'old']);
});

test('同秒清單由一筆變兩筆、子集合或排序改變時，既有下注 ID 維持不變', () => {
  const context = vm.createContext({});
  const orderHelper = syncSource.slice(syncSource.indexOf('function preserveWebsiteOrder'), syncSource.indexOf('function sendBets'));
  const idHelper = source.slice(source.indexOf('function stableBetTail'), source.indexOf('let installationIdPromise'));
  vm.runInContext(`${orderHelper}\n${idHelper}`, context);
  const first = { itemNumber: '1', placedAt: '2026-09-27T19:00:00+08:00', event: '三星連碰', selection: '01,02,03' };
  const second = { itemNumber: '2', placedAt: first.placedAt, event: '二星連碰', selection: '04,05,06' };
  const idFor = (rows, itemNumber) => {
    const row = context.preserveWebsiteOrder(clone(rows)).find(item => item.itemNumber === itemNumber);
    return context.stableBetTail(row, `legacy-${itemNumber}`, 0);
  };
  const original = idFor([first], '1');
  assert.equal(idFor([first, second], '1'), original);
  assert.equal(idFor([second, first], '1'), original);
  assert.equal(idFor([first], '1'), original);
  const secondId = idFor([first, second], '2');
  assert.equal(idFor([second], '2'), secondId);
  assert.equal(context.stableBetTail({ ...first, sourcePlacedAt: first.placedAt }, 'gateway|source-id', 0), 'gateway|source-id');
});

test('同一來源的非同步上傳依觀測順序執行，較舊請求未完成前不送出後續請求', async () => {
  const fixture = setup();
  const events = [];
  let releaseOld;
  const old = fixture.context.queueRemoteUpload('bets|device|site', async () => {
    events.push('old-start');
    await new Promise(resolve => { releaseOld = resolve; });
    events.push('old-end');
    return 'old';
  });
  const newer = fixture.context.queueRemoteUpload('bets|device|site', async () => {
    events.push('new-start');
    events.push('new-end');
    return 'new';
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['old-start']);
  releaseOld();
  assert.equal(await old, 'old');
  assert.equal(await newer, 'new');
  assert.deepEqual(events, ['old-start', 'old-end', 'new-start', 'new-end']);
});

test('M05 慢線下連續相同快照只排一次，真實變更與刪單依序保留', async () => {
  const fixture=setup();
  let release;
  const events=[];
  const slow=()=>new Promise(resolve=>{release=()=>resolve({ok:true});});
  const unchanged={bets:[{id:'one',status:'active'}],client:'site',token:'token'};
  const deleted={bets:[{id:'one',status:'deleted'}],client:'site',token:'token'};
  const next={bets:[{id:'one',status:'deleted'},{id:'two',status:'active'}],client:'site',token:'token'};
  const first=fixture.context.queueCoalescedBetUpload('site',unchanged,async()=>{events.push('start');return slow();});
  await new Promise(resolve=>setImmediate(resolve));
  const repeated=Array.from({length:100},()=>fixture.context.queueCoalescedBetUpload('site',unchanged,async()=>{events.push('duplicate');}));
  const changed=fixture.context.queueCoalescedBetUpload('site',deleted,async()=>{events.push('deleted');return {ok:true};});
  const more=fixture.context.queueCoalescedBetUpload('site',next,async()=>{events.push('new-id');return {ok:true};});
  const heartbeat=fixture.context.queueRemoteUpload('heartbeat|site',async()=>{events.push('heartbeat');return {ok:true};});
  await heartbeat;
  assert.deepEqual(events,['start','heartbeat']);
  release();
  await Promise.all([first,...repeated,changed,more]);
  assert.deepEqual(events,['start','heartbeat','deleted','new-id']);
  assert.match(source,/queueRemoteUpload\(`heartbeat\|\$\{clientSite\}`/);
});

test('M05 timeout/failure releases coalescing so next identical snapshot can retry', async () => {
  const fixture=setup();
  const snapshot={bets:[{id:'once',status:'active'}],client:'site'};
  await assert.rejects(fixture.context.queueCoalescedBetUpload('site',snapshot,async()=>{throw new Error('timeout');}),/timeout/);
  let calls=0;
  const result=await fixture.context.queueCoalescedBetUpload('site',snapshot,async()=>{calls++;return {ok:true};});
  assert.equal(result.ok,true);
  assert.equal(calls,1);
});

test('總帳快照拒絕較舊觀測值，但接受真正較晚的網站更正', async () => {
  const fixture = setup({ ledgerSnapshots: [{ id: 'same', date: today, totalAmount: 200, capturedAt: '2026-09-27T12:00:02.000Z' }] });
  await fixture.context.saveLedgerSnapshot([{ id: 'same', date: today, totalAmount: 100, capturedAt: '2026-09-27T12:00:01.000Z' }], 'site');
  assert.equal(fixture.storage.ledgerSnapshots[0].totalAmount, 200);
  await fixture.context.saveLedgerSnapshot([{ id: 'same', date: today, totalAmount: 300, capturedAt: '2026-09-27T12:00:03.000Z' }], 'site');
  assert.equal(fixture.storage.ledgerSnapshots[0].totalAmount, 300);
});

test('M03 本機快照拒絕 malformed capturedAt，等價時區以同一 UTC 比較', async () => {
  const fixture=setup({ledgerSnapshots:[{id:'same',date:today,totalAmount:200,capturedAt:'2026-09-29T00:00:00.000Z'}]});
  await fixture.context.saveLedgerSnapshot([{id:'same',date:today,totalAmount:999,capturedAt:'invalid'}],'site');
  assert.equal(fixture.storage.ledgerSnapshots[0].totalAmount,200);
  await fixture.context.saveLedgerSnapshot([{id:'new',date:today,totalAmount:999,capturedAt:'2026-02-30T00:00:00Z'}],'site');
  assert.equal(fixture.storage.ledgerSnapshots.length,1);
  await fixture.context.saveLedgerSnapshot([{id:'same',date:today,totalAmount:300,capturedAt:'2026-09-29T08:00:00+08:00'}],'site');
  assert.equal(fixture.storage.ledgerSnapshots[0].totalAmount,300);
  assert.equal(fixture.storage.ledgerSnapshots[0].capturedAt,'2026-09-29T00:00:00.000Z');
});

for (const count of [0, 500, 501, 1201]) {
  test(`上傳 ${count} 筆保持每個欄位及原順序，空清單仍送心跳`, async () => {
    const fixture = setup();
    const bets = Array.from({ length: count }, (_, i) => ({ id: `same-second|${i}`, itemNumber: 1, selection: '02', playType: '台號', stake: 400, status: i % 2 ? 'active' : 'deleted' }));
    const original = clone(bets), client = { installationId: 'device', site: 'device|site' };
    assert.deepEqual(clone(await fixture.context.uploadBetBatches(bets, client, 'test-token')), { ok: true, count, error: '' });
    assert.deepEqual(fixture.requests.flatMap(x => x.bets), original);
    assert.deepEqual(bets, original);
    assert.equal(fixture.requests.length, Math.max(1, Math.ceil(count / 500)));
    assert.ok(fixture.requests.every(x => x.bets.length <= 500));
    assert.ok(fixture.requests.every(x => JSON.stringify(x.client) === JSON.stringify(client)));
  });
}

test('第二批失敗會停止並回報已完成筆數，重送保持原 ID', async () => {
  const fixture = setup(), received = new Map();
  let calls = 0;
  fixture.context.fetch = async (url, options) => {
    const { bets } = JSON.parse(options.body);
    if (++calls === 2) return { ok: false, status: 503, json: async () => ({ error: 'unavailable' }) };
    bets.forEach(bet => received.set(bet.id, bet));
    return { ok: true, json: async () => ({}) };
  };
  const bets = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), stake: i }));
  assert.deepEqual(clone(await fixture.context.uploadBetBatches(bets, {}, 'test')), { ok: false, count: 500, error: 'unavailable' });
  assert.equal(calls, 2);
  assert.equal((await fixture.context.uploadBetBatches(bets, {}, 'test')).ok, true);
  assert.deepEqual([...received.values()], bets);
  fixture.context.fetch = async () => { throw new Error('offline'); };
  assert.equal((await fixture.context.uploadBetBatches(bets, {}, 'test')).ok, false);
});

test('正式訊息入口並行保存兩站快照，501 筆在建立穩定 ID 後才分批', async () => {
  const storage = { installationId: 'device', syncToken: 'test-token' };
  const uploaded = [];
  let listener;
  const context = vm.createContext({
    importScripts() {}, URL, TextEncoder, AbortController, DOMException, setTimeout, clearTimeout, btoa: value => Buffer.from(value, 'binary').toString('base64'),
    SyncDiagnostics: { record: () => ({}), errorCode: () => 'FAILED' },
    chrome: {
      alarms: { create() {}, onAlarm: { addListener() {} } },
      tabs: { query: async () => [] },
      runtime: { onStartup: { addListener() {} }, onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } }, getManifest: () => ({ version: 'test' }) },
      storage: { local: {
        get(keys, callback) {
          const snapshot = clone(storage);
          const promise = new Promise(resolve => setImmediate(() => resolve(snapshot)));
          if (callback) { promise.then(callback); return; }
          return promise;
        },
        async set(value) { await new Promise(resolve => setImmediate(resolve)); Object.assign(storage, clone(value)); }
      }}
    },
    fetch: async (url, options) => {
      if (url.endsWith('/api/bets')) uploaded.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ accepted: 1 }) };
    }
  });
  vm.runInContext(source, context);
  const send = (message, site = 'vs968.net') => new Promise(resolve => {
    assert.equal(listener(message, { url: `https://${site}/` }, resolve), true);
  });
  const results = await Promise.all(['vs968.net', 'kd998.net'].flatMap(site => [
    send({ type: 'LEARN_DETAIL_REQUEST', request: { root: site, body: site } }, site),
    send({ type: 'STORE_LEDGER_SNAPSHOT', rows: [{ date: today, source: site, gameName: '539', phaseName: 'F1', playType: '正碼', totalAmount: 760 }] }, site)
  ]));
  assert.ok(results.every(result => result.ok));
  assert.equal(Object.keys(storage.learnedDetailRequests).length, 2);
  assert.equal(storage.ledgerSnapshots.length, 2);
  const bets = Array.from({ length: 501 }, () => ({ id: 'site|old', account: 'sample', itemNumber: 1, placedAt: '2026-09-23T12:00:00Z', event: '台號', selection: '02', stake: 400 }));
  assert.equal((await send({ type: 'SYNC_BETS', bets })).count, 501);
  assert.deepEqual(uploaded.map(batch => batch.bets.length), [500, 1]);
  const rows = uploaded.flatMap(batch => batch.bets);
  assert.equal(new Set(rows.map(row => row.id)).size, 501);
  assert.ok(rows[500].id.endsWith('|500'));
  assert.equal(rows[500].stake, 400);
  assert.equal(rows[500].account, 'sample');
});

test('不同 frame 同時登記實際帳號不會互相覆蓋', async () => {
  const storage = {};
  let listener;
  const context = vm.createContext({
    importScripts() {}, URL, TextEncoder, AbortController, DOMException, setTimeout, clearTimeout,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    SyncDiagnostics: { record: () => ({}), errorCode: () => 'FAILED' },
    chrome: {
      alarms: { create() {}, onAlarm: { addListener() {} } }, tabs: { query: async () => [] },
      runtime: { onStartup: { addListener() {} }, onInstalled: { addListener() {} }, onMessage: { addListener(fn) { listener = fn; } }, getManifest: () => ({ version: 'test' }) },
      storage: { local: {
        get(keys, callback) {
          const snapshot = clone(storage);
          const promise = new Promise(resolve => setImmediate(() => resolve(snapshot)));
          if (callback) { promise.then(callback); return; }
          return promise;
        },
        async set(value) { await new Promise(resolve => setImmediate(resolve)); Object.assign(storage, clone(value)); }
      }}
    }, fetch: async () => ({ ok: true, json: async () => ({}) })
  });
  vm.runInContext(source, context);
  const register = (url, account) => new Promise(resolve => {
    assert.equal(listener({ type: 'REGISTER_ACTUAL_ACCOUNT', account }, { url, frameId: Math.random() }, resolve), true);
  });
  const results = await Promise.all([
    register('https://w1.vs968.net/Front/', 'A001'),
    register('https://www2.kd998.net/new_web/', 'B002'),
  ]);
  assert.ok(results.every(result => result.ok));
  assert.equal(storage.detectedAccounts['w1.vs968.net'].account, 'A001');
  assert.equal(storage.detectedAccounts['vs968.net'].account, 'A001');
  assert.equal(storage.detectedAccounts['www2.kd998.net'].account, 'B002');
  assert.equal(storage.detectedAccounts['kd998.net'].account, 'B002');
});

test('M04 安裝清理與帳號登記共用佇列，只清舊群組號且不覆蓋新帳號', async () => {
  const fixture=setup({detectedAccounts:{'kd998.net':{account:'F106953'},'vs968.net':{account:'keep'}}});
  assert.match(source,/onInstalled\.addListener\([\s\S]*?clearLegacyKdAccounts\(\)/);
  await Promise.all([
    fixture.context.clearLegacyKdAccounts(),
    fixture.context.saveDetectedAccount('www2.kd998.net','kd998.net','real-account'),
    fixture.context.saveDetectedAccount('w1.vs968.net','vs968.net','new-wind'),
  ]);
  assert.equal(fixture.storage.detectedAccounts['kd998.net'].account,'real-account');
  assert.equal(fixture.storage.detectedAccounts['www2.kd998.net'].account,'real-account');
  assert.equal(fixture.storage.detectedAccounts['vs968.net'].account,'new-wind');
});

test('M04 多 frame 車數學習經背景同一佇列合併，不遺失不同玩法', async () => {
  const parser=await readFile(new URL('../../RuntimeData/同步器擴充功能/src/content/parsers-dom.js',import.meta.url),'utf8');
  assert.match(parser,/safeMessage\(\{\s*type:\s*['"]LEARN_KD_CAR_UNITS['"]/);
  const fixture=setup({kdCarUnits:{既有:3800}});
  await Promise.all([
    fixture.context.saveKdCarUnits({正碼:3800}),
    fixture.context.saveKdCarUnits({全車:5300}),
  ]);
  assert.deepEqual(fixture.storage.kdCarUnits,{既有:3800,正碼:3800,全車:5300});
});
