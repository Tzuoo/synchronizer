import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('async function requestReconciliation(');
const end = html.indexOf('\ndocument.addEventListener', start);

function helper() {
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.runInNewContext(`${html.slice(start, end)};globalThis.requestReconciliation=requestReconciliation`, context);
  return context.requestReconciliation;
}

test('對帳成功只回報已由 API 確認的 ID', async () => {
  const result = await helper()(['a', 'b'], true, async () => ({ ok: true, status: 200 }));
  assert.deepEqual(Array.from(result.succeeded), ['a', 'b']);
  assert.deepEqual(Array.from(result.failed), []);
  assert.equal(result.unauthorized, false);
});

test('對帳 401、503 與斷線均不得被當成已成功', async () => {
  for (const response of [
    async () => ({ ok: false, status: 401 }),
    async () => ({ ok: false, status: 503 }),
    async () => { throw new Error('offline'); },
  ]) {
    const result = await helper()(['a'], true, response);
    assert.deepEqual(Array.from(result.succeeded), []);
    assert.deepEqual(Array.from(result.failed), ['a']);
  }
  assert.equal((await helper()(['a'], true, async () => ({ ok: false, status: 401 }))).unauthorized, true);
});

test('多筆對帳部分成功時只提交成功 ID，失敗 ID 留在原狀態', async () => {
  const result = await helper()(['a', 'b', 'c'], false, async id => {
    if (id === 'b') return { ok: false, status: 503 };
    if (id === 'c') throw new Error('offline');
    return { ok: true, status: 200 };
  });
  assert.deepEqual(Array.from(result.succeeded), ['a']);
  assert.deepEqual(Array.from(result.failed), ['b', 'c']);
  assert.equal(result.unauthorized, false);
});
