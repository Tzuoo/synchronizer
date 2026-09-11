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

test('喜特殊包牌兩組完整一致才跨來源一對一配對，保留網站名稱', () => {
  const base = { source: '喜', account: 'test', placedAt: '2026-09-02T18:11:34+08:00', betAmount: 23800, status: '待結算' };
  const dom = { ...base, id: 'kd998.net|kd-batch|F-test|1', itemNumber: '1', playType: '特殊包牌', event: '特殊包牌', selection: '特殊包牌｜visibility visibility_off 連二星:\n01,02,03\n04,06\n組三星:\n05,15,25,35｜下注金額 23800' };
  const gateway = { ...base, id: 'kd998.net|kd-gateway-batch|1', playType: '三星', event: '三星', selection: '三星｜1~2~3~4~6&5~15~25~35｜下注金額 23800｜車數 未辨識' };
  for (const rows of [[dom, gateway], [gateway, dom]]) {
    const result = context.dedupeExactBets(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].playType, '特殊包牌');
    assert.equal(result[0].itemNumber, '1');
  }
  assert.equal(context.dedupeExactBets([dom, { ...dom, id: 'kd998.net|kd-batch|F-test|2' }, gateway, { ...gateway, id: 'kd998.net|kd-gateway-batch|2' }]).length, 2);
  for (const changed of [{ account: 'other' }, { betAmount: 23801 }, { status: '已刪單' }, { placedAt: '2026-09-02T18:11:35+08:00' }, { selection: gateway.selection.replace('25~35','35~25') }, { selection: gateway.selection.replace('1~2~3','1~3~2') }]) {
    assert.equal(context.dedupeExactBets([dom, { ...gateway, ...changed }]).length, 2);
  }
});

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

test("風雲六合台號 gateway 與明細以號碼、金額及秒數一對一配對", () => {
  const dom = { ...wind("vs968.net|a0593|table|6|61", "台號 61"), event: "六合 / 台號", playType: "台號", stake: 200, potentialPayout: 400, betAmount: 400, carCount: 2 };
  const gateway = { ...wind("vs968.net|a0593|gateway|6|61", "61"), event: "六合 / S594 - 001", playType: "台號", stake: 200, potentialPayout: 200, betAmount: 200, carCount: null };
  const duplicateDom = { ...dom, id: "vs968.net|a0593|table|6|61-duplicate" };
  const duplicateGateway = { ...gateway, id: "vs968.net|a0593|gateway|7|61" };
  const result = context.dedupeExactBets([dom, duplicateDom, gateway, duplicateGateway]);
  assert.equal(result.length, 2, "真正同秒重複下注要保留兩筆");
  assert.ok(result.every(row => row.ids.length === 2));
  assert.ok(result.every(row => row.carCount === 2));
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

test("風雲特碼／特別號與台號的表格及 gateway 表示會一對一配對", () => {
  const base = {
    source: "風雲", account: "a0593", placedAt: "2026-09-08T20:07:51+08:00",
    stake: 500, potentialPayout: 500, unitAmount: 500, combinationCount: null,
    carCount: null, betAmount: 500, status: "待結算", reconciled: false,
  };
  const rows = [
    { ...base, id: "vs968.net|a0593|table|3|02", event: "大樂 / 特碼", playType: "特碼", selection: "特碼 02", itemNumber: "3" },
    { ...base, id: "vs968.net|a0593|gateway|30|1", event: "特別號", playType: "特別號", selection: "2" },
    { ...base, id: "vs968.net|a0593|table|3|06", event: "大樂 / 特碼", playType: "特碼", selection: "特碼 06", itemNumber: "3" },
    { ...base, id: "vs968.net|a0593|gateway|30|2", event: "特別號", playType: "特別號", selection: "6" },
    { ...base, id: "vs968.net|a0593|table|2|36", placedAt: "2026-09-08T20:03:44+08:00", event: "大樂 / 台號", playType: "台號", selection: "台號 36", itemNumber: "2" },
    { ...base, id: "vs968.net|a0593|gateway|29|2", placedAt: "2026-09-08T20:03:44+08:00", event: "台號", playType: "台號", selection: "36" },
  ];
  const result = context.dedupeExactBets(rows);
  assert.equal(result.length, 3);
  assert.deepEqual(Array.from(result, row => row.itemNumber), ["3", "3", "2"]);
  assert.ok(result.every(row => row.ids.length === 2));
});

test("風雲大樂台號以網站列金額去重，支數不再重複相乘", () => {
  const base = {
    source: "風雲", account: "a0593", placedAt: "2026-09-11T19:03:28+08:00",
    playType: "台號", stake: 500, unitAmount: 500, status: "待結算", reconciled: false,
  };
  const dom = { ...base, id: "vs968.net|a0593|table|1|02", event: "大樂 / T105477 - 001", selection: "台號 02", carCount: 5, potentialPayout: 500, betAmount: 500 };
  const gateway = { ...base, id: "vs968.net|a0593|gateway|88|1", event: "台號", selection: "2", carCount: null, potentialPayout: 500, betAmount: 500 };
  const result = context.dedupeExactBets([dom, gateway]);
  assert.equal(result.length, 1);
  assert.equal(result[0].betAmount, 500);
  assert.equal(result[0].carCount, 5);
  assert.deepEqual(Array.from(result[0].ids), [dom.id, gateway.id]);
  assert.match(html, /isWindTaihao=b\.source==='風雲'/);
  assert.match(extension, /\^六合\\s\*\[／\/\]/);
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
