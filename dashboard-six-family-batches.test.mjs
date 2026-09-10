import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const countSource = html.match(/function getCountLabel[\s\S]*?(?=\nfunction formatStructuredSelection)/)?.[0];
const source = html.match(/function displayBets[\s\S]*?(?=\nfunction draw)/)?.[0];
assert.ok(countSource && source, "displayBets and count label must be present");

const context = {
  escapeHtml: value => String(value),
  formatStructuredSelection: (playType, selection) => `${playType}:${selection}`,
  getBetAmount: bet => Number(bet.betAmount ?? bet.potentialPayout ?? bet.stake ?? 0),
  getUnitAmount: bet => Number(bet.unitAmount ?? bet.stake ?? 0),
  isDeletedBet: () => false,
  money: value => `$${Number(value)}`,
};
vm.runInNewContext(
  `let bets=[];${countSource};${source};globalThis.displayRows=rows=>{bets=rows;return displayBets()}`,
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

test("風雲六合台號沿用原始支數，批次合計不再顯示未辨識或車數", () => {
  const rows = context.displayRows([
    { ...base, id: "wind-1|table|x|1", source: "風雲", event: "六合 / 台號", playType: "台號", selection: "台號 61", stake: 200, betAmount: 400, carCount: 2 },
    { ...base, id: "wind-1|table|x|2", source: "風雲", event: "六合 / 台號", playType: "台號", selection: "台號 91", stake: 200, betAmount: 400, carCount: 2 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].countLabel, "4支");
  assert.match(rows[0].displaySelection, /61[\s\S]*2支/);
  assert.match(rows[0].displaySelection, /91[\s\S]*2支/);
  assert.doesNotMatch(rows[0].displaySelection, /未辨識|車/);
});

test("風雲目前六批六合台號可依原始支數回算各批總額", () => {
  const batches = [
    ["20:59:15", [["61", 2], ["91", 2]], 800, 4],
    ["20:09:15", [["08", 3], ["12", 3], ["20", 3], ["21", 3], ["27", 3], ["30", 3], ["40", 3], ["43", 3], ["72", 3], ["79", 3], ["96", 3], ["98", 3]], 7200, 36],
    ["20:05:36", [["15", 1]], 100, 1],
    ["20:05:23", [["41", 2], ["59", 2], ["84", 1], ["95", 1], ["99", 2]], 1600, 8],
    ["19:52:57", [["00", 4], ["01", 4], ["05", 2], ["50", 2], ["70", 4], ["72", 2]], 3600, 18],
    ["19:07:55", [["02", 10], ["36", 10]], 4000, 20],
  ];
  const input = batches.flatMap(([time, details, total, countTotal]) => {
    const unitAmount = total / countTotal;
    return details.map(([number, count], index) => ({
    ...base, id: `wind|table|${time}|${number}`, source: "風雲", event: "六合 / 台號", playType: "台號",
    placedAt: `2026-09-10T${time}+08:00`, selection: `台號 ${number}`, stake: unitAmount,
    betAmount: unitAmount * count, carCount: count, itemNumber: String(index + 1),
    }));
  });
  const rows = context.displayRows(input);
  assert.deepEqual(Array.from(rows, row => [row.totalLabel, row.countLabel]), batches.map(([, , total, count]) => [`$${total}`, `${count}支`]));
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
