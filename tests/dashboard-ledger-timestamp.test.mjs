import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function dedupeLedgerRows(');
const end = html.indexOf('\nfunction ', start + 1);
assert.ok(start >= 0 && end > start);

test('M03 ledger dedupe compares equivalent timezone and later instants, not formatted text', () => {
  const context = { normalizeLedgerPhaseName: value => value, Map, Date };
  vm.runInNewContext(`${html.slice(start, end)};globalThis.dedupe=dedupeLedgerRows`, context);
  const base = { site: '98', account: 'a', date: '2026-09-29', gameName: '539', phaseName: '1', playType: '正碼' };
  const result = context.dedupe([
    { ...base, totalAmount: 100, capturedAt: '2026-09-29T08:00:00+08:00' },
    { ...base, totalAmount: 200, capturedAt: '2026-09-29T01:00:00.000Z' },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].totalAmount, 200);
});
