import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = html.match(/function displayBets[\s\S]*?(?=\nfunction draw)/)?.[0];
assert.ok(source, "displayBets must be present");

const context = {
  escapeHtml: value => String(value),
  formatStructuredSelection: (playType, selection) => `${playType}:${selection}`,
  getBetAmount: bet => Number(bet.betAmount ?? bet.potentialPayout ?? bet.stake ?? 0),
  getUnitAmount: bet => Number(bet.unitAmount ?? bet.stake ?? 0),
  getCountLabel: bet => String(bet.combinationCount ?? "—"),
  isDeletedBet: () => false,
  money: value => `$${Number(value)}`,
};
vm.runInNewContext(
  `let bets=[];${source};globalThis.displayRows=rows=>{bets=rows;return displayBets()}`,
  context,
);

const base = {
  account: "test",
  placedAt: "2026-08-27T21:11:23+08:00",
  selection: "10",
  stake: 50,
  potentialPayout: 50,
  betAmount: 50,
  reconciled: false,
};

test("只有風雲六合 gateway 明細會合併成台號批次", () => {
  const rows = context.displayRows([
    { ...base, id: "wind-1|gateway|x|1", source: "風雲", event: "六合 / 台號", playType: "台號" },
    { ...base, id: "wind-2|gateway|x|2", source: "風雲", event: "六合 / 台號", playType: "台號", selection: "11" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayEvent, "台號");
});

test("16 與航海保留網站原始玩法及每一批", () => {
  const rows = context.displayRows([
    { ...base, id: "16-1", source: "16", event: "六合 / 天碰二連碰", playType: "天碰二連碰" },
    { ...base, id: "16-2", source: "16", event: "六合 / 天碰二連碰", playType: "天碰二連碰", selection: "11" },
    { ...base, id: "sea-1", source: "航海", event: "六合 / 全車單碰", playType: "全車單碰" },
    { ...base, id: "sea-2", source: "航海", event: "六合 / 特碼單碰", playType: "特碼單碰", selection: "35" },
  ]);
  assert.equal(rows.length, 4, "同秒的真正不同批次不可合併");
  assert.deepEqual(Array.from(rows, row => row.displayEvent), ["天碰二連碰", "天碰二連碰", "全車單碰", "特碼單碰"]);
  assert.ok(rows.every(row => !row._sixBatch));
});
