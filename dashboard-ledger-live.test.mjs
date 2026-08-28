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
  assert.match(html, /const orderedRows=\[\.\.\.rows\]\.sort\(ledgerRowCompare\)/);
  assert.match(html, /Number\(a\.sourceOrder\)/);
  assert.doesNotMatch(html, /updatedAt.*sort|sort.*updatedAt/);
});
