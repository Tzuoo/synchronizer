import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const extension = await readFile(new URL("../RuntimeData/同步器擴充功能/content.js", import.meta.url), "utf8");
const source = html.match(/function isDeletedBet[\s\S]*?(?=\nfunction displayBets)/)?.[0];
assert.ok(source, "dashboard dedupe functions must be present");
const context = {};
vm.runInNewContext(`${source};globalThis.dedupeExactBets=dedupeExactBets;globalThis.collapseWindNumberBatches=collapseWindNumberBatches`, context);

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

test("風雲 539 表格與 gateway 名稱格式不同仍只保留網站兩批", () => {
  const base = {
    source: "風雲", account: "a0593", event: "三星", stake: 1000,
    potentialPayout: 1000, unitAmount: 1000, combinationCount: 1,
    carCount: null, betAmount: 1000, status: "待結算", reconciled: false,
  };
  const rows = [
    { ...base, id: "vs968.net|a0593|table|2", placedAt: "2026-08-29T19:58:44+08:00", event: "539 / 三星單碰", playType: "三星單碰", selection: "三星單碰 visibility visibility_off 27, 28, 29 點 此畫面不注內容", itemNumber: "2" },
    { ...base, id: "vs968.net|a0593|gateway|2", placedAt: "2026-08-29T19:58:44+08:00", playType: "三星", selection: "27&28&29" },
    { ...base, id: "vs968.net|a0593|table|1", placedAt: "2026-08-29T19:58:40+08:00", event: "539 / 三星單碰", playType: "三星單碰", selection: "三星單碰 visibility visibility_off 27, 28, 29 點 此畫面不注內容", itemNumber: "1" },
    { ...base, id: "vs968.net|a0593|gateway|1", placedAt: "2026-08-29T19:58:40+08:00", playType: "三星", selection: "27&28&29" },
  ];
  const result = context.dedupeExactBets(rows);
  assert.equal(result.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.map(row => row.itemNumber))), ["2", "1"]);
  assert.ok(result.every(row => row.ids.length === 2));
});

test("風雲 539 正碼與 gateway 全車同一批只保留網站原始正碼", () => {
  assert.match(extension, /const carCount = numeric\(text\(row, "\.col-unit"\)\)/);
  assert.match(extension, /carCount: carCount > 0 \? carCount : null/);
  const base = {
    source: "風雲", account: "a0593", placedAt: "2026-08-31T18:13:45+08:00",
    potentialPayout: 0, unitAmount: null, combinationCount: null,
    status: "待結算", reconciled: false,
  };
  const rows = [
    { ...base, id: "vs968.net|a0593|table|1|15", event: "539 / 正碼", playType: "正碼", selection: "正碼 15", itemNumber: "1", stake: 3800, betAmount: 3800, carCount: 1 },
    { ...base, id: "vs968.net|a0593|table|1|16", event: "539 / 正碼", playType: "正碼", selection: "正碼 16", itemNumber: "1", stake: 1140, betAmount: 1140, carCount: 0.3 },
    { ...base, id: "vs968.net|a0593|table|1|24", event: "539 / 正碼", playType: "正碼", selection: "正碼 24", itemNumber: "1", stake: 1140, betAmount: 1140, carCount: 0.3 },
    { ...base, id: "vs968.net|a0593|gateway|1|15", event: "全車", playType: "全車", selection: "15", stake: 3800, betAmount: 3800, carCount: 3800 },
    { ...base, id: "vs968.net|a0593|gateway|1|16", event: "全車", playType: "全車", selection: "16", stake: 1140, betAmount: 1140, carCount: 1140 },
    { ...base, id: "vs968.net|a0593|gateway|1|24", event: "全車", playType: "全車", selection: "24", stake: 1140, betAmount: 1140, carCount: 1140 },
  ];
  const result = context.dedupeExactBets(rows);
  assert.equal(result.length, 3);
  assert.deepEqual(Array.from(result, row => [row.playType, row.selection, row.stake, row.itemNumber]), [
    ["正碼", "正碼 15", 3800, "1"],
    ["正碼", "正碼 16", 1140, "1"],
    ["正碼", "正碼 24", 1140, "1"],
  ]);
  assert.ok(result.every(row => row.ids.length === 2));
  const batches = context.collapseWindNumberBatches(result);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].itemNumber, "1");
  assert.equal(batches[0].stake, 6080);
  assert.deepEqual(Array.from(batches[0]._windDetails, detail => [detail.number, detail.amount, detail.carCount]), [["15", 3800, 1], ["16", 1140, 0.3], ["24", 1140, 0.3]]);
  assert.match(html, /x\.carCount==null\?'未辨識'/);
  assert.doesNotMatch(html, /isWindNumberBatch\)\?detailRows\.map\(x=>[^\n]*money\(x\.amount\)/);
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
