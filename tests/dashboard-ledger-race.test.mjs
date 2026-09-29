import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const code = html.slice(html.indexOf('function ledgerViewState('), html.indexOf('\nfunction getBetAmount('));
function fixture() {
  let today = '2026-09-28';
  const pending = [], rendered = [], states = new Map();
  const context = vm.createContext({
    authToken: 'session', IS_LOCAL_PREVIEW: false, API_ROOT: 'https://isolated.test/api',
    lastLedgerRows: [{ totalAmount: 50 }], lastLedgerDay: today, lastLedgerDate: today,
    Date, Intl: { DateTimeFormat: function() { return { format: () => today }; } },
    authHeaders: () => ({}), prepareLedgerView() {}, loginCount: 0,
    requireLogin() { context.loginCount++; },
    renderLedger(rows) { rendered.push(Array.from(rows, row => row.totalAmount)); },
    $(key) { if (!states.has(key)) states.set(key, { classList: { remove() {} }, textContent: '' }); return states.get(key); },
    fetchJsonWithTimeout: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  });
  vm.runInContext(code, context);
  const respond = (index, amount, status = 200) => pending[index].resolve({ response: { ok: status === 200, status }, payload: { rows: amount == null ? [] : [{ totalAmount: amount }], dates: [today] } });
  return { context, pending, rendered, respond, day(value) { today = value; } };
}

test('B-02 較舊總帳成功回應不得覆蓋較新且較小的金額', async () => {
  const f = fixture(), old = f.context.loadLedger(), recent = f.context.loadLedger();
  f.respond(1, 20); await recent;
  f.respond(0, 100); await old;
  assert.deepEqual(f.rendered, [[20]]);
  assert.equal(f.context.lastLedgerRows[0].totalAmount, 20);
});

test('B-02 舊請求 401／timeout 不得使新成功結果失效', async () => {
  for (const status of [401, 'timeout']) {
    const f = fixture(), old = f.context.loadLedger(), recent = f.context.loadLedger();
    f.respond(1, 80); await recent;
    if (status === 401) f.respond(0, null, 401);
    else f.pending[0].reject(new Error('timeout'));
    await old;
    assert.equal(f.context.loginCount, 0);
    assert.deepEqual(f.rendered, [[80]]);
  }
});

test('B-02 最新請求 401 仍要求登入，同日失敗保留快取，成功空則清空', async () => {
  const f = fixture();
  let promise = f.context.loadLedger(); f.respond(0, null, 401); await promise;
  assert.equal(f.context.loginCount, 1);
  promise = f.context.loadLedger(); f.pending[1].reject(new Error('timeout')); await promise;
  assert.deepEqual(f.rendered.at(-1), [50]);
  promise = f.context.loadLedger(); f.respond(2, null); await promise;
  assert.deepEqual(f.rendered.at(-1), []);
});

test('B-02 午夜前發出的成功或失敗回應不得保留昨日快取', async () => {
  for (const success of [true, false]) {
    const f = fixture(), pending = f.context.loadLedger();
    f.day('2026-09-29');
    if (success) f.respond(0, 100); else f.pending[0].reject(new Error('offline'));
    await pending;
    assert.deepEqual(f.rendered.at(-1), []);
    assert.equal(f.context.lastLedgerDay, '2026-09-29');
  }
});

test('B-02 切換登入工作階段後，舊回應不寫入快取', async () => {
  const f = fixture(), pending = f.context.loadLedger();
  f.context.authToken = 'other-session'; f.respond(0, 500); await pending;
  assert.deepEqual(f.rendered, []);
});
