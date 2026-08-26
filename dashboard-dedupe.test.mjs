import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = html.match(/function isDeletedBet[\s\S]*?(?=\nfunction displayBets)/)?.[0];
assert.ok(source, "dashboard dedupe functions must be present");
const context = {};
vm.runInNewContext(`${source};globalThis.dedupeExactBets=dedupeExactBets`, context);

function wind(id, selection) {
  return {
    id,
    source: "風雲",
    account: "a0593",
    placedAt: id.includes("gateway") ? "2026-08-25T21:08:44+08:00" : "2026-08-25T21:08:44.999+08:00",
    event: "六合 / S589 - 001",
    playType: "台號",
    selection,
    stake: 200,
    potentialPayout: 200,
    unitAmount: 200,
    combinationCount: null,
    carCount: null,
    betAmount: 200,
    status: "待結算",
    reconciled: false,
  };
}

test("風雲 gateway 與明細表格同一筆只保留一次", () => {
  const rows = [
    wind("vs968.net|a0593|table|0", "台號 57"),
    wind("vs968.net|a0593|table|1", "台號 58"),
    wind("vs968.net|a0593|gateway|1|1", "57"),
    wind("vs968.net|a0593|gateway|1|2", "58"),
  ];
  const result = context.dedupeExactBets(rows);
  assert.equal(result.length, 2);
  assert.equal(result.reduce((sum, bet) => sum + bet.betAmount, 0), 400);
  assert.deepEqual(Array.from(result[0].ids), [rows[0].id, rows[2].id]);
});

test("同秒兩筆真正相同的明細仍依出現次數保留", () => {
  const rows = [
    wind("vs968.net|a0593|table|0", "台號 57"),
    wind("vs968.net|a0593|table|1", "台號 57"),
    wind("vs968.net|a0593|gateway|1|1", "57"),
    wind("vs968.net|a0593|gateway|2|1", "57"),
  ];
  const result = context.dedupeExactBets(rows);
  assert.equal(result.length, 2);
  assert.equal(result.reduce((sum, bet) => sum + bet.betAmount, 0), 400);
  assert.ok(result.every(bet => bet.ids.length === 2));
});

test("喜網站 DOM 與 gateway 批次一對一配對且保留真實重複批次", () => {
  const base = {
    source: "喜", account: "a0593", placedAt: "2026-08-26T20:26:43+08:00",
    event: "正碼", playType: "正碼",
    selection: "正碼｜07｜下注金額 1140｜車數 0.3 車",
    stake: 1140, potentialPayout: 815.67, unitAmount: 1140,
    combinationCount: null, carCount: 0.3, betAmount: 1140,
    status: "待結算", reconciled: false,
  };
  const rows = [
    { ...base, id: "kd998.net|a0593|kd-batch|G-1|16" },
    { ...base, id: "kd998.net|a0593|kd-batch|G-1|17" },
    { ...base, id: "kd998.net|a0593|kd-gateway-batch|100", selection: "正碼｜7｜下注金額 1140｜車數 未辨識", potentialPayout: 815.67000001, carCount: null, parseStatus: "partial" },
    { ...base, id: "kd998.net|a0593|kd-gateway-batch|101", selection: "正碼｜7｜下注金額 1140｜車數 未辨識", potentialPayout: 815.67000001, carCount: null, parseStatus: "partial" },
  ];
  const result = context.dedupeExactBets(rows);
  assert.equal(result.length, 2);
  assert.ok(result.every(bet => bet.ids.length === 2));
  assert.ok(result.every(bet => bet.selection.includes("0.3 車")));
});
