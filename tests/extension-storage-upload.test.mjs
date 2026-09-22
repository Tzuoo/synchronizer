import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../RuntimeData/同步器擴充功能/background.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('let snapshotStorageQueue'), source.indexOf('async function getInstallationId'));
const clone = value => JSON.parse(JSON.stringify(value));
function setup(initial = {}) {
  let storage = clone(initial), failWrite = false;
  const requests = [];
  const context = vm.createContext({
    DASHBOARD: 'https://test.invalid',
    chrome: { storage: { local: {
      async get() { const snapshot = clone(storage); await new Promise(resolve => setImmediate(resolve)); return snapshot; },
      async set(value) { await new Promise(resolve => setImmediate(resolve)); if (failWrite) { failWrite = false; throw new Error('write failed'); } Object.assign(storage, clone(value)); }
    }}},
    fetch: async (url, options) => { requests.push(clone(JSON.parse(options.body))); return { ok: true, json: async () => ({}) }; }
  });
  vm.runInContext(helpers, context);
  return { context, requests, get storage() { return storage; }, failNextWrite() { failWrite = true; } };
}

test('同時保存不同網站學習及總帳，既有資料與最新同鍵快照皆保留', async () => {
  const fixture = setup({ learnedDetailRequests: { old: { body: 'keep' } }, ledgerSnapshots: [{ id: 'old', totalAmount: 7 }] });
  const a = { root: 'vs968.net', body: 'source-a' }, b = { root: 'kd998.net', body: 'source-b' };
  await Promise.all([
    fixture.context.saveLearnedRequest(a.root, a), fixture.context.saveLearnedRequest(b.root, b),
    fixture.context.saveLedgerSnapshot([{ id: 'a', playType: '台號', totalAmount: 400 }], 'vs968.net'),
    fixture.context.saveLedgerSnapshot([{ id: 'b', playType: '正碼', totalAmount: 760 }], 'kd998.net'),
    fixture.context.saveLedgerSnapshot([{ id: 'a', playType: '台號', totalAmount: 800 }], 'vs968.net')
  ]);
  assert.equal(fixture.storage.learnedDetailRequests.old.body, 'keep');
  assert.equal(fixture.storage.learnedDetailRequests[a.root].body, a.body);
  assert.equal(fixture.storage.learnedDetailRequests[b.root].body, b.body);
  assert.deepEqual(fixture.storage.ledgerSnapshots, [{ id: 'old', totalAmount: 7 }, { id: 'a', playType: '台號', totalAmount: 800 }, { id: 'b', playType: '正碼', totalAmount: 760 }]);
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
    importScripts() {}, URL, TextEncoder, btoa: value => Buffer.from(value, 'binary').toString('base64'),
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
    send({ type: 'STORE_LEDGER_SNAPSHOT', rows: [{ date: '2026-09-23', source: site, gameName: '539', phaseName: 'F1', playType: '正碼', totalAmount: 760 }] }, site)
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
