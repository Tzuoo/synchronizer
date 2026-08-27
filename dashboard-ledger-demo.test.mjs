import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
test("跨日後不再顯示昨日固定總帳測試資料", () => {
  assert.doesNotMatch(html, /const LEDGER_DEMO/);
  assert.doesNotMatch(html, /161050|28620|C115207|2026-08-26/);
  assert.match(html, /尚未收到今日總帳/);
  assert.match(html, /尚未取得今日總帳資料/);
  assert.match(html, /timeZone:'Asia\/Taipei'/);
});

test("下注明細與總帳使用固定頁籤及可保留的網址狀態", () => {
  assert.match(html, /id="betsTab"[^>]+href="\?view=bets"[^>]*>下注明細</);
  assert.match(html, /id="ledgerTab"[^>]+href="\?view=ledger"[^>]*>總帳</);
  assert.match(html, /PAGE_PARAMS\.get\('view'\)===['"]ledger['"]/);
});
