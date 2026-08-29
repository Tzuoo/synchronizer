import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = html.match(/function normalizeLedgerPhaseName[\s\S]*?(?=\nfunction renderLedger)/)?.[0];
assert.ok(source, "總帳期別正規化與去重函式必須存在");
const context = {};
vm.runInNewContext(`${source};globalThis.dedupeLedgerRows=dedupeLedgerRows`, context);

test("風雲 DOM 與 Vuex 相同期別總帳只保留最新快照", () => {
  const base = {
    site: "風雲", account: "a0593", date: "2026-08-29", gameName: "539",
    playType: "三星", totalAmount: 2000, winningAmount: 0,
  };
  const rows = context.dedupeLedgerRows([
    { ...base, id: "dom", phaseName: "第F105964期", updatedAt: "2026-08-29T20:01:00Z" },
    { ...base, id: "vuex", phaseName: "F105964", updatedAt: "2026-08-29T20:02:00Z" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "vuex");
  assert.equal(rows[0].phaseName, "F105964");
  assert.equal(rows[0].totalAmount, 2000);
});

test("不同帳號或不同網站的同一期總帳不可合併", () => {
  const base = {
    date: "2026-08-29", gameName: "六合", phaseName: "S591",
    playType: "台號", totalAmount: 6100, winningAmount: 7260,
  };
  const rows = context.dedupeLedgerRows([
    { ...base, id: "wind", site: "風雲", account: "a0593" },
    { ...base, id: "joy", site: "喜", account: "a0593" },
    { ...base, id: "other", site: "風雲", account: "other" },
  ]);
  assert.equal(rows.length, 3);
});
