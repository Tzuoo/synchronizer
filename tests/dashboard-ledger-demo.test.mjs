import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
test("總帳不使用固定測試資料且只顯示台灣當天", () => {
  assert.doesNotMatch(html, /const LEDGER_DEMO/);
  assert.doesNotMatch(html, /161050|28620|C115207|2026-08-26/);
  assert.match(html, /尚未收到網站今日總帳/);
  assert.match(html, /尚未取得網站今日總帳資料/);
  assert.match(html, /dedupeLedgerRows\(ledgerRowsForToday\(rows,today\)/);
  assert.match(html, /timeZone:'Asia\/Taipei'/);
});

test("總帳跨站加總前只接受今天的日期鍵，昨日與缺日期不混入", () => {
  const source = html.match(/function ledgerRowsForToday\(rows,today\)\{[^}]+\}/)?.[0];
  assert.ok(source);
  const context = {};
  vm.runInNewContext(`${source};globalThis.ledgerRowsForToday=ledgerRowsForToday`, context);
  const rows = [
    { date: '2026-09-24', totalAmount: 12800 },
    { date: '2026-09-25', totalAmount: 2520 },
    { date: '', totalAmount: 5120 },
    { date: '2026-09-25', totalAmount: 2080 },
  ];
  assert.deepEqual(Array.from(context.ledgerRowsForToday(rows, '2026-09-25'), row => row.totalAmount), [2520, 2080]);
});

test("下注畫面不再把非今日但網站仍顯示的資料濾掉", () => {
  assert.doesNotMatch(html, /String\(b\.placedAt\)\.slice\(0,10\)===today/);
  assert.match(html, /目前資料總額/);
});

test("下注明細與總帳使用固定頁籤及可保留的網址狀態", () => {
  assert.match(html, /id="betsTab"[^>]+href="\?view=bets"[^>]*>下注明細</);
  assert.match(html, /id="ledgerTab"[^>]+href="\?view=ledger"[^>]*>總帳</);
  assert.match(html, /PAGE_PARAMS\.get\('view'\)===['"]ledger['"]/);
});

test("總帳成功空資料會清空；請求失敗只沿用同一台灣日期快取，跨日不得沿用", () => {
  const start = html.indexOf('function ledgerViewState(');
  const end = html.indexOf('\nasync function loadLedger', start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.runInNewContext(`${html.slice(start, end)};globalThis.ledgerViewState=ledgerViewState`, context);
  const oldRows = [{ id: 'old', totalAmount: 100 }];
  let state = context.ledgerViewState({ ok: true, rows: [], today: '2026-09-27', previousDay: '2026-09-27', previousRows: oldRows });
  assert.deepEqual(Array.from(state.rows), []);
  assert.equal(state.cacheDay, '2026-09-27');
  state = context.ledgerViewState({ ok: false, rows: [], today: '2026-09-27', previousDay: '2026-09-27', previousRows: oldRows });
  assert.equal(state.rows[0].id, 'old');
  state = context.ledgerViewState({ ok: false, rows: [], today: '2026-09-28', previousDay: '2026-09-27', previousRows: oldRows });
  assert.deepEqual(Array.from(state.rows), []);
  assert.equal(state.cacheDay, '2026-09-28');
});
