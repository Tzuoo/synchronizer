import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");

test("live ledger fetches authorized current snapshots", () => {
  assert.match(html, /fetch\(`\$\{API_ROOT\}\/ledger`/);
  assert.match(html, /authHeaders\(\)/);
  assert.match(html, /setInterval\(loadLedger,10000\)/);
});

test("live ledger keeps original game and play hierarchy", () => {
  assert.match(html, /row\.gameName/);
  assert.match(html, /row\.playType/);
  assert.match(html, /尚未回報或解析失敗的網站不列為 0/);
});

test("live ledger order is stable and does not follow polling timestamps", () => {
  assert.match(html, /function ledgerRowCompare/);
  assert.match(html, /const orderedRows=\[\.\.\.uniqueRows\]\.sort\(ledgerRowCompare\)/);
  assert.match(html, /Number\(a\.sourceOrder\)/);
  assert.doesNotMatch(html, /updatedAt.*sort|sort.*updatedAt/);
});

test("總帳固定 539 在六合之前", () => {
  assert.match(html, /value==='539'\?0:value==='六合'\?1:2/);
  assert.match(html, /gameOrder=.*\.sort\(gameDisplayCompare\)/);
  assert.match(html, /games=.*\.sort\(gameDisplayCompare\)/);
});

test("總帳玩法固定依正碼車二三四星排序", () => {
  assert.match(html, /play==='正碼'\)return 0/);
  assert.match(html, /play==='車'\|\|play==='全車'\)return 1/);
  assert.match(html, /play==='二星'\)return 2/);
  assert.match(html, /play==='三星'\)return 3/);
  assert.match(html, /play==='四星'\)return 4/);
  assert.match(html, /rows\]\.sort\(ledgerPlayCompare\)/);
});

test("跨站總帳每個玩法顯示各站加總過程", () => {
  assert.match(html, /totalParts:\[\],winningParts:\[\]/);
  assert.match(html, /current\.totalParts\.push\(totalAmount\)/);
  assert.match(html, /總量加總過程<\/th><th>總量<\/th><th class="ledger-equation-head">中獎加總過程<\/th><th>中獎/);
  assert.match(html, /class="ledger-equation total-equation">\$\{ledgerEquation\(row\.totalParts,row\.totalAmount\)\}<\/td><td class="ledger-amount"/);
  assert.match(html, /class="ledger-equation winning-equation">\$\{ledgerEquation\(row\.winningParts,row\.winningAmount\)\}<\/td><td class="ledger-winning"/);
  assert.match(html, /aggregateHtml=.*gameBlock\(game,'跨站合計'.*,true\)/);
  assert.match(html, /\.ledger-equation\.total-equation\{color:var\(--yellow\)\}/);
  assert.match(html, /\.ledger-equation\.winning-equation\{color:var\(--green\)\}/);
  assert.match(html, /\.ledger-table\.with-equations\{display:block!important;min-width:0!important\}/);
  assert.match(html, /\.ledger-table\.with-equations tbody tr\{display:grid!important/);
  assert.match(html, /\.ledger-table th,\.ledger-table td\{display:table-cell!important;position:static!important/);
});
