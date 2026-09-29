import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const background = await readFile(new URL('../../RuntimeData/同步器擴充功能/background.js', import.meta.url), 'utf8');
const pageHook = await readFile(new URL('../../RuntimeData/同步器擴充功能/page-hook.js', import.meta.url), 'utf8');

function backgroundTimeoutContext() {
  const start = background.indexOf('const REQUEST_TIMEOUT_MS');
  const end = background.indexOf('function utf8Base64', start);
  assert.ok(start >= 0 && end > start, '背景請求必須提供可測試的 timeout helper');
  const context = vm.createContext({ AbortController, DOMException, setTimeout, clearTimeout });
  vm.runInContext(`${background.slice(start, end)};globalThis.withRequestTimeout=withRequestTimeout`, context);
  return context;
}

test('H7 背景 timeout helper 支援快速回應、timeout、abort 與 timeout 後恢復', async () => {
  const { withRequestTimeout } = backgroundTimeoutContext();
  assert.equal(await withRequestTimeout(async () => 'fast', 30), 'fast');
  await assert.rejects(withRequestTimeout(() => new Promise(() => {}), 5), /timeout/i);
  assert.equal(await withRequestTimeout(async () => 'after-timeout', 30), 'after-timeout');

  const parent = new AbortController();
  const aborted = withRequestTimeout(() => new Promise(() => {}), 100, parent.signal);
  parent.abort();
  await assert.rejects(aborted, error => error?.name === 'AbortError');
});

test('H7 已 timeout 的舊 Promise 晚完成不得產生呼叫端副作用', async () => {
  const { withRequestTimeout } = backgroundTimeoutContext();
  let releaseOld;
  const applied = [];
  const old = withRequestTimeout(() => new Promise(resolve => { releaseOld = resolve; }), 5)
    .then(value => applied.push(value), () => {});
  await new Promise(resolve => setTimeout(resolve, 10));
  await withRequestTimeout(async () => 'new', 30).then(value => applied.push(value));
  releaseOld('old');
  await old;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(applied, ['new']);
});

test('H7 網站 fetch 被動觀察不阻塞原 response，且同請求舊 body 晚到不覆蓋新結果', async () => {
  const start = pageHook.indexOf('const PASSIVE_OBSERVATION_TIMEOUT_MS');
  const end = pageHook.indexOf('const open = XMLHttpRequest.prototype.open', start);
  const helperStart = pageHook.indexOf('const PAGE_REQUEST_TIMEOUT_MS');
  const helperEnd = pageHook.indexOf('function isExplicitDeleteFlag', helperStart);
  assert.ok(start >= 0 && end > start, 'page-hook 必須把被動 body 觀察與網站 response 解耦');
  let resolveOld;
  const published = [];
  const oldResponse = { clone: () => ({ text: () => new Promise(resolve => { resolveOld = resolve; }) }) };
  const newResponse = { clone: () => ({ text: async () => 'new-body' }) };
  const responses = [oldResponse, newResponse];
  const context = vm.createContext({
    AbortController, DOMException, Headers, URL, setTimeout, clearTimeout,
    location: { href: 'https://example.test/', hostname: 'example.test' },
    publish: (...args) => published.push(args[4]),
    window: { fetch: async () => responses.shift() },
  });
  vm.runInContext(`${pageHook.slice(helperStart, helperEnd)}${pageHook.slice(start, end)};globalThis.observeWebsiteFetchResponse=observeWebsiteFetchResponse`, context);
  const first = await context.window.fetch('https://example.test/detail');
  assert.equal(first, oldResponse, '不得等待 clone.text 才交還網站 response');
  await context.window.fetch('https://example.test/detail');
  await new Promise(resolve => setImmediate(resolve));
  resolveOld('old-body');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(published, ['new-body']);

  const never = { clone: () => ({ text: () => new Promise(() => {}) }) };
  assert.equal(await context.observeWebsiteFetchResponse(never, {
    url: 'https://example.test/never', method: 'GET', body: '', contentType: '', headers: {}
  }, 5), false);
});

test('H7 共版總帳 timeout 後 busy 可恢復，舊 dispatch 晚完成不再發文', async () => {
  const start = pageHook.indexOf('const PAGE_REQUEST_TIMEOUT_MS');
  const end = pageHook.indexOf('\n  const publish =', start);
  assert.ok(start >= 0 && end > start, '共版總帳必須共用 page timeout helper');
  let releaseOld;
  let mode = 'never';
  const posted = [];
  const ledgerState = { seqs: [] };
  const store = { state: { Ledger: ledgerState }, dispatch(action, id) {
    if (mode === 'never') return new Promise(resolve => { releaseOld = resolve; });
    if (action === 'Ledger.c520') ledgerState.seqs = [{ id: 1, casinoLabel: '539', seq: 'C1', playItems: [] }];
    if (action === 'Ledger.c533') ledgerState.seqs[0].playItems = [{ label: '正碼', amount: 100, win: 0 }];
    return Promise.resolve();
  } };
  const context = vm.createContext({
    AbortController, DOMException, setTimeout, clearTimeout,
    document: { querySelectorAll: () => [{ __vue__: { $store: store, $parent: null } }], documentElement: { dataset: {} } },
    location: { hostname: 'www.vs968.net' },
    window: { postMessage: message => { if (message.type === 'SYNC_SHARED_LEDGER_ROWS') posted.push(message.rows); } },
  });
  vm.runInContext(`let sharedLedgerBusy=false;${pageHook.slice(start, end)};globalThis.pollSharedLedger=pollSharedLedger`, context);
  await context.pollSharedLedger(5);
  mode = 'fast';
  await context.pollSharedLedger(30);
  releaseOld();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(posted.length, 1);
  assert.equal(posted[0][0].totalAmount, 100);
});

test('H7 自有背景 fetch 均使用 timeout，明細補讀以 AbortController 結束', () => {
  assert.match(background, /fetchJsonWithTimeout\(`\$\{DASHBOARD\}\/api\/bets/);
  assert.match(background, /fetchJsonWithTimeout\(`\$\{DASHBOARD\}\/api\/ledger/);
  assert.match(background, /fetchAllBetPages\(`\$\{DASHBOARD\}\/api\/extension-preview/);
  assert.match(background, /withRequestTimeout\(signal => fetch\(LOCAL_PREVIEW_CACHE/);
  assert.match(background, /withRequestTimeout[\s\S]{0,500}__sync\/ledger-cache/);
  assert.match(pageHook, /withPageRequestTimeout\([\s\S]*?nativeFetch\(pollUrl/);
  assert.match(pageHook, /finally \{\s*detailPollBusy = false/);
});

test('H2 擴充 extension-preview 依游標讀完所有頁並保留舊 API 相容性', async () => {
  const start = background.indexOf('const REQUEST_TIMEOUT_MS');
  const end = background.indexOf('let localPreviewRefreshPromise', start);
  const calls = [];
  const pages = [
    { bets: [{ id: '1', placedAt: '2026-09-27T01:00:00Z' }, { id: '2', placedAt: '2026-09-27T03:00:00Z' }], page: { hasMore: true, nextCursor: 'next', order: 'rowid-desc' } },
    { bets: [{ id: '3', placedAt: '2026-09-27T02:00:00Z' }], page: { hasMore: false, nextCursor: null, order: 'rowid-desc' } },
  ];
  const context = vm.createContext({
    AbortController, DOMException, setTimeout, clearTimeout, URL,
    fetch: async url => { calls.push(String(url)); return { ok: true, json: async () => pages.shift() }; },
  });
  vm.runInContext(`${background.slice(start, end)};globalThis.fetchAllBetPages=fetchAllBetPages`, context);
  const result = await context.fetchAllBetPages('https://example.test/api/extension-preview');
  assert.deepEqual(JSON.parse(JSON.stringify(result.bets.map(row => row.id))), ['2', '3', '1']);
  assert.match(calls[1], /cursor=next/);

  context.fetch = async () => ({ ok: true, json: async () => ({ bets: [{ id: 'legacy' }] }) });
  const legacy = await context.fetchAllBetPages('https://example.test/api/extension-preview');
  assert.equal(legacy.bets[0].id, 'legacy');
});

test('大型被動 response 不截斷解析，小型與非 JSON 仍原樣交付', () => {
  const start = pageHook.indexOf('const MAX_OBSERVED_RESPONSE_CHARS');
  const end = pageHook.indexOf('const PASSIVE_OBSERVATION_TIMEOUT_MS', start);
  const messages = [];
  const context = vm.createContext({
    URL,
    location: { href: 'https://example.test/', hostname: 'example.test' },
    window: { postMessage: message => messages.push(message) },
  });
  vm.runInContext(`let lastRequest=null,lastDetailResponse=null;${pageHook.slice(start, end)};globalThis.publish=publish`, context);
  const small = '{"DataList":[]}';
  context.publish('https://example.test/api/Front/A07/Query', 'POST', '', 'application/json', small, {});
  assert.equal(messages.at(-1).response, small);
  const near = `{"x":"${'a'.repeat(499980)}"}`;
  context.publish('https://example.test/api/Front/A07/Query', 'POST', '', 'application/json', near, {});
  assert.equal(messages.at(-1).response.length, near.length);
  const oversized = `{"x":"${'a'.repeat(500010)}"}`;
  context.publish('https://example.test/api/Front/A07/Query', 'POST', '', 'application/json', oversized, {});
  assert.equal(messages.at(-1).type, 'SYNC_DIAGNOSTIC_EVENT');
  assert.equal(messages.filter(message => message.type === 'SYNC_LEDGER_RESPONSE' && message.response === oversized).length, 0);
  const nonJson = '下注明細：plain text';
  context.publish('https://example.test/detail', 'GET', '', 'text/plain', nonJson, {});
  assert.equal(messages.at(-1).response, nonJson);
});

test('慢速大型被動 response 不阻塞網站，完成後明確放棄解析', async () => {
  const helperStart = pageHook.indexOf('const PAGE_REQUEST_TIMEOUT_MS');
  const helperEnd = pageHook.indexOf('function isExplicitDeleteFlag', helperStart);
  const publishStart = pageHook.indexOf('const MAX_OBSERVED_RESPONSE_CHARS');
  const publishEnd = pageHook.indexOf('const PASSIVE_OBSERVATION_TIMEOUT_MS', publishStart);
  const passiveStart = publishEnd;
  const passiveEnd = pageHook.indexOf('const open = XMLHttpRequest.prototype.open', passiveStart);
  let release;
  const response = { clone: () => ({ text: () => new Promise(resolve => { release = () => resolve(`{"x":"${'a'.repeat(500010)}"}`); }) }) };
  const messages = [];
  const context = vm.createContext({
    AbortController, DOMException, Headers, URL, setTimeout, clearTimeout,
    location: { href: 'https://example.test/', hostname: 'example.test' },
    window: { fetch: async () => response, postMessage: message => messages.push(message) },
  });
  vm.runInContext(`${pageHook.slice(helperStart, helperEnd)}let lastRequest=null,lastDetailResponse=null;${pageHook.slice(publishStart, publishEnd)}${pageHook.slice(passiveStart, passiveEnd)}`, context);
  assert.equal(await context.window.fetch('https://example.test/api/Front/A07/Query'), response);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1).type, 'SYNC_DIAGNOSTIC_EVENT');
  assert.equal(messages.some(message => message.type === 'SYNC_LEDGER_RESPONSE'), false);
});
