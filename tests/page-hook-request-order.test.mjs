import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../RuntimeData/同步器擴充功能/page-hook.js', import.meta.url), 'utf8');
function fixture() {
  const pending = [], published = [];
  const context = vm.createContext({
    AbortController, DOMException, Headers, URL, setTimeout, clearTimeout,
    location: { href: 'https://site.test/', hostname: 'site.test' },
    publish: (...args) => published.push(args[4]),
    window: { fetch: (...args) => new Promise((resolve, reject) => pending.push({ resolve, reject, args })) },
  });
  const helpers = source.slice(source.indexOf('const PAGE_REQUEST_TIMEOUT_MS'), source.indexOf('function isExplicitDeleteFlag'));
  const wrapper = source.slice(source.indexOf('const PASSIVE_OBSERVATION_TIMEOUT_MS'), source.indexOf('const open = XMLHttpRequest.prototype.open'));
  vm.runInContext(helpers + wrapper, context);
  return { context, pending, published };
}
const response = text => ({ clone: () => ({ text: async () => text }) });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('C-02 相同請求 headers 反向抵達，只發布啟動較新的結果', async () => {
  const f = fixture(), old = f.context.window.fetch('/detail'), recent = f.context.window.fetch('/detail');
  const newer = response('new'); f.pending[1].resolve(newer);
  assert.equal(await recent, newer); await tick();
  const older = response('old'); f.pending[0].resolve(older);
  assert.equal(await old, older); await tick();
  assert.deepEqual(f.published, ['new']);
});

test('C-02 不同 page/query 或 body 各自觀察，網站 fetch 錯誤仍原樣交還', async () => {
  const f = fixture();
  const first = f.context.window.fetch('/detail?page=1', { method: 'POST', body: 'period=1' });
  const second = f.context.window.fetch('/detail?page=2', { method: 'POST', body: 'period=1' });
  f.pending[1].resolve(response('page2')); await second; await tick();
  f.pending[0].resolve(response('page1')); await first; await tick();
  assert.deepEqual(f.published, ['page2', 'page1']);
  const failure = new Error('native failure'), third = f.context.window.fetch('/failed');
  f.pending[2].reject(failure);
  await assert.rejects(third, error => error === failure);
});
