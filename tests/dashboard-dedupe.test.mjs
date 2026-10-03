import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const extension = await readFile(new URL("../../RuntimeData/同步器擴充功能/content.js", import.meta.url), "utf8");
const source = html.match(/function isDeletedBet[\s\S]*?(?=\nfunction displayBets)/)?.[0];
assert.ok(source, "dashboard dedupe functions must be present");
const context = {};
vm.runInNewContext(`${source};globalThis.isDeletedBet=isDeletedBet;globalThis.dedupeExactBets=dedupeExactBets;globalThis.collapseWindNumberBatches=collapseWindNumberBatches`, context);

test('喜實站三星柱碰三柱完整順序相符才與 gateway 一對一配對', () => {
  const base = { source:'喜', account:'test', placedAt:'2026-10-03T18:44:55+08:00', betAmount:19200, status:'已撤單' };
  const dom = {...base, id:'kd|kd-batch|G-test|1 已撤單', itemNumber:null, playType:'三星柱碰', event:'三星柱碰', selection:'三星柱碰｜一柱:\n02,12,22\n二柱:\n07,17,27,37\n三柱:\n01,03,04\n38,39｜下注金額 19200', rawText:'539 / F106986 - 002'};
  const gateway = {...base, id:'kd|kd-gateway-batch|123', itemNumber:'1', playType:'三星', event:'三星', selection:'三星｜2~12~22&7~17~27~37&1~3~4~38~39｜下注金額 19200｜車數 未辨識', rawText:JSON.stringify({game:{seq:'F106986'},group:{no:2}})};
  for (const rows of [[dom,gateway],[gateway,dom]]) {
    const result=context.dedupeExactBets(rows);
    assert.equal(result.length,1);
    assert.equal(result[0].playType,'三星柱碰');
    assert.equal(result[0].itemNumber,'1');
    assert.equal(result[0].ids.length,2);
  }
  assert.equal(context.dedupeExactBets([dom,{...dom,id:'kd|kd-batch|G-test|2'},gateway,{...gateway,id:'kd|kd-gateway-batch|124'}]).length,2);
  for (const changed of [{account:'other'},{betAmount:19201},{status:'待結算'},{selection:gateway.selection.replace('2~12~22','12~2~22')},{rawText:JSON.stringify({game:{seq:'F106987'},group:{no:2}})}]) {
    assert.equal(context.dedupeExactBets([dom,{...gateway,...changed}]).length,2);
  }
});

test('風雲六合特碼與特別號只在明示期別群組及內容相符時配對', () => {
  const base={source:'風雲',account:'test',placedAt:'2026-10-03T18:09:40+08:00',stake:500,betAmount:500,status:'待結算'};
  const dom={...base,id:'wind|table|1',event:'六合 / S601 - 002',playType:'特碼',selection:'特碼 20',carCount:5};
  const gateway={...base,id:'wind|gateway|123|1',event:'特別號',playType:'特別號',selection:'20',rawText:JSON.stringify({casino:1,game:{seq:'S601'},group:{no:2}})};
  for(const rows of [[dom,gateway],[gateway,dom]]) {
    const result=context.dedupeExactBets(rows);
    assert.equal(result.length,1); assert.equal(result[0].playType,'特碼'); assert.equal(result[0].ids.length,2);
  }
  for(const changed of [{rawText:''},{rawText:JSON.stringify({casino:3,game:{seq:'F106986'},group:{no:2}})},{selection:'22'},{status:'已撤單'}]) assert.equal(context.dedupeExactBets([dom,{...gateway,...changed}]).length,2);
});

test('刪單只依明確狀態，不掃描下注內容或操作文字', () => {
  const base = { status: '待結算', rawText: '台號 02　刪單　取消　新增備註', selection: '取消連碰', event: '刪單說明', note: '可取消後重選' };
  assert.equal(context.isDeletedBet(base), false);
  assert.equal(context.isDeletedBet({ ...base, status: '已刪單' }), true);
  assert.equal(context.isDeletedBet({ ...base, status: '已撤單' }), true);
  assert.equal(context.isDeletedBet({ ...base, deleted: true }), true);
});

test('H1 新舊 source-item ID 共存時，以網站原始秒數及內容視為同一筆', () => {
  const base = {
    source: '16', account: 'you320', event: '539 / 三星連碰', playType: '三星連碰',
    selection: '01,02,03', stake: 500, potentialPayout: 5000, unitAmount: 500,
    combinationCount: 10, carCount: null, betAmount: 5000, status: '待結算', reconciled: false,
  };
  const oldRow = { ...base, id: 'device|site|you320|source-item|1|2026-09-27T19:00:00.999+08:00|三星連碰|01,02,03|0', placedAt: '2026-09-27T19:00:00.999+08:00' };
  const newRow = { ...base, id: 'device|site|you320|source-item|1|2026-09-27T19:00:00+08:00|三星連碰|01,02,03|0', placedAt: '2026-09-27T19:00:00+08:00' };
  const result = context.dedupeExactBets([oldRow, newRow]);
  assert.equal(result.length, 1);
  assert.deepEqual(Array.from(result[0].ids), [oldRow.id, newRow.id]);
});

test('C-03 海勝2同秒同內容但不同項次的真實批次必須保留兩筆', () => {
  const base = {
    source: '海勝2', account: '0593', placedAt: '2026-09-28T20:00:00+08:00',
    event: '539 / 三星連碰', playType: '三星連碰', selection: '03,25,33,35,38',
    stake: 500, potentialPayout: 5000, unitAmount: 500, combinationCount: 10,
    carCount: null, betAmount: 5000, status: '待結算', reconciled: false,
  };
  const first = { ...base, id: 'and539.com|0593|source-item|1|2026-09-28T20:00:00+08:00|三星連碰|03,25,33,35,38|0', itemNumber: '1' };
  const second = { ...base, id: 'and539.com|0593|source-item|2|2026-09-28T20:00:00+08:00|三星連碰|03,25,33,35,38|0', itemNumber: '2' };
  const result = context.dedupeExactBets([first, second]);
  assert.equal(result.length, 2);
  assert.deepEqual(Array.from(result, row => row.itemNumber), ['1', '2']);
  assert.ok(result.every(row => row.ids.length === 1));
});

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

test('喜二星連碰撤單的 DOM 與 gateway 表示同批時保留網站原名及撤單；真實雙批不合併', () => {
  const base = { source: '喜', account: 'a0593', placedAt: '2026-09-30T19:38:51+08:00', betAmount: 10000, reconciled: false };
  const dom = { ...base, id: 'kd998.net|kd-batch|F-test|6', itemNumber: '6', event: '二星連碰', playType: '二星連碰', selection: '二星連碰｜visibility visibility球號03,23,25,36,37 點此查看下注內容｜下注金額 10000', status: '待結算' };
  const gateway = { ...base, id: 'kd998.net|kd-gateway-batch|123', event: '二星', playType: '二星', selection: '二星｜3&23&25&36&37｜下注金額 10000｜車數 未辨識', status: '已撤單' };
  for (const rows of [[dom, gateway], [gateway, dom]]) {
    const result = context.dedupeExactBets(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].playType, '二星連碰');
    assert.equal(result[0].itemNumber, '6');
    assert.equal(result[0].status, '已撤單');
    assert.deepEqual(Array.from(result[0].ids), rows.map(row => row.id));
  }
  assert.equal(context.dedupeExactBets([dom, { ...dom, id: 'kd998.net|kd-batch|F-test|5' }, gateway]).length, 2);
  for (const changed of [{ account: 'other' }, { betAmount: 9999 }, { placedAt: '2026-09-30T19:38:52+08:00' }, { selection: '二星｜3&23&25&36&38｜下注金額 10000' }]) {
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

test("風雲四星連碰與 gateway 四星同批一對一配對，真正雙批仍保留", () => {
  const base = { source: "風雲", account: "a0593", placedAt: "2026-10-02T19:28:49+08:00", betAmount: 1000, stake: 1000, status: "待結算" };
  const dom = { ...base, id: "vs968.net|a0593|table|1", itemNumber: "1", event: "539 / 四星連碰", playType: "四星連碰", selection: "四星連碰 visibility visibility_off 05, 23, 25, 36, 37 點此查看下注內容" };
  const gateway = { ...base, id: "vs968.net|a0593|gateway|123|1", event: "四星", playType: "四星", selection: "5&23&25&36&37" };
  for (const rows of [[dom, gateway], [gateway, dom]]) {
    const result = context.dedupeExactBets(rows);
    assert.equal(result.length, 1);
    assert.equal(result[0].playType, "四星連碰");
    assert.equal(result[0].itemNumber, "1");
    assert.deepEqual(Array.from(result[0].ids), rows.map(row => row.id));
  }
  assert.equal(context.dedupeExactBets([dom, { ...dom, id: "vs968.net|a0593|table|2", itemNumber: "2" }, gateway, { ...gateway, id: "vs968.net|a0593|gateway|124|1" }]).length, 2);
  for (const changed of [{ account: "other" }, { betAmount: 2000 }, { placedAt: "2026-10-02T19:28:50+08:00" }, { selection: "5&23&25&36&38" }, { status: "已撤單" }]) {
    assert.equal(context.dedupeExactBets([dom, { ...gateway, ...changed }]).length, 2);
  }
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

test("風雲大樂台號以網站列金額去重，並依同一批次收合支數", () => {
  const base = {
    source: "風雲", account: "a0593", placedAt: "2026-09-11T19:03:28+08:00",
    playType: "台號", stake: 500, unitAmount: 500, status: "待結算", reconciled: false,
  };
  const tableRows = ['02','36','49'].map(number => ({ ...base, id: `vs968.net|a0593|table|1|${number}`, event: "大樂 / T105477 - 001", selection: `台號 ${number}`, itemNumber: '1', carCount: 5, potentialPayout: 500, betAmount: 500 }));
  const gatewayRows = ['2','36','49'].map((number,index) => ({ ...base, id: `vs968.net|a0593|gateway|88|${index + 1}`, event: "台號", selection: number, carCount: null, potentialPayout: 500, betAmount: 500 }));
  const result = context.dedupeExactBets([...tableRows,...gatewayRows]);
  assert.equal(result.length, 3);
  assert.ok(result.every(row => row.betAmount === 500 && row.carCount === 5 && row.ids.length === 2));
  const batches = context.collapseWindNumberBatches(result);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].playType, '台號');
  assert.equal(batches[0].betAmount, 1500);
  assert.equal(batches[0]._windDetailUnit, '支');
  assert.deepEqual(Array.from(batches[0]._windDetails, detail => [detail.number, detail.carCount]), [['02',5],['36',5],['49',5]]);
  assert.match(html, /isWindTaihao=b\.source==='風雲'/);
  assert.match(html, /\^\(\?:539\|大樂\|加州彩\)\\s\*\[\\\/／-\]/);
  assert.match(extension, /const betAmount = stake;/);
  assert.doesNotMatch(extension, /stake \* carCount/);
});

test("風雲離開明細的同一大樂 gateway 父批次仍收合，不合併另一真實批次", () => {
  const base = {
    source: "風雲", account: "a0593", placedAt: "2026-09-15T18:18:13+08:00",
    event: "大樂 / T105478 - 002", playType: "台號", stake: 400,
    potentialPayout: 400, unitAmount: 400, carCount: 4, betAmount: 400,
    status: "待結算", reconciled: false, itemNumber: null,
  };
  const sameParent = ['02','36'].map((number,index) => ({ ...base,
    id: `vs968.net|gateway|88|${index + 1}`, selection: number
  }));
  const otherBatch = { ...base, id: 'vs968.net|gateway|89|1', selection: '49' };
  const batches = context.collapseWindNumberBatches([...sameParent,otherBatch]);
  assert.equal(batches.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(Array.from(batches, batch => [batch.betAmount, batch._windDetails.map(detail => detail.number)]))), [
    [800,['02','36']], [400,['49']]
  ]);
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
