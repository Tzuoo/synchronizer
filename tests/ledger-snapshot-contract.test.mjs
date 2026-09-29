import test from 'node:test';
import assert from 'node:assert/strict';
import { planLedgerSnapshot } from '../tools/ledger-snapshot-contract.mjs';

const scope = { date: '2026-09-28', site: '海勝2', account: '0593', gameName: '大樂', phaseName: 'TEST', clientSite: 'device|and539.com' };
const row = id => ({ ...scope, id, playType: '台號單碰', totalAmount: 100, winningAmount: 0 });
const snapshot = (rows, fields = {}) => ({ version: 1, scope, rows, outcome: 'success', complete: true, generation: 2, ...fields });
const previous = { generation: 1, rows: [row('one'), row('two'), { ...row('other'), account: 'other' }] };
const verification = { confirmedCompleteScope: scope };

test('B-04 離線契約：已確認完整成功少列及空快照只撤回精確範圍缺席列', () => {
  assert.deepEqual(planLedgerSnapshot(previous, snapshot([row('two')]), verification).withdrawIds, ['one']);
  assert.deepEqual(planLedgerSnapshot(previous, snapshot([]), verification).withdrawIds, ['one', 'two']);
});

test('B-04 離線契約：未驗證完整性、子集合及解析失敗不撤回', () => {
  assert.deepEqual(planLedgerSnapshot(previous, snapshot([])).withdrawIds, []);
  assert.deepEqual(planLedgerSnapshot(previous, snapshot([], { complete: false }), verification).withdrawIds, []);
  const failed = planLedgerSnapshot(previous, snapshot([row('bad')], { outcome: 'parse-failed' }), verification);
  assert.deepEqual(failed.upserts, []);
  assert.deepEqual(failed.withdrawIds, []);
});

test('B-04 離線契約：錯誤範圍、重複ID、非法列及舊generation拒絕套用', () => {
  for (const rows of [[{ ...row('bad'), account: 'other' }], [row('one'), row('one')], [{ ...row('bad'), totalAmount: null }]]) {
    assert.throws(() => planLedgerSnapshot(previous, snapshot(rows), verification));
  }
  assert.deepEqual(planLedgerSnapshot(previous, snapshot([], { generation: 1 }), verification).withdrawIds, []);
  assert.deepEqual(planLedgerSnapshot(previous, snapshot([]), { confirmedCompleteScope: { ...scope, clientSite: 'other' } }).withdrawIds, []);
});
