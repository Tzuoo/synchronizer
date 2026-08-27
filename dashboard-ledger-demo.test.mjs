import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
test("總帳不使用固定測試資料並依網站目前內容顯示", () => {
  assert.doesNotMatch(html, /const LEDGER_DEMO/);
  assert.doesNotMatch(html, /161050|28620|C115207|2026-08-26/);
  assert.match(html, /尚未收到網站目前總帳/);
  assert.match(html, /尚未取得網站目前總帳資料/);
  assert.doesNotMatch(html, /WHERE ledger_date|row\.date === today/);
  assert.match(html, /timeZone:'Asia\/Taipei'/);
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
