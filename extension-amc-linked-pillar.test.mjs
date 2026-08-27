import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const content = await readFile(new URL("../RuntimeData/同步器擴充功能/content.js", import.meta.url), "utf8");
const scraper = content.match(/function scrapeAmcOrders[\s\S]*?(?=\nfunction scrapeVs968Json)/)?.[0];
assert.ok(scraper, "航海共用解析器必須存在");

const context = {
  location: { hostname: "w0.pee688.com" },
  rootDomain: () => "pee688.com",
  scrapeCommonPillarRows: () => [],
  gameSectionFromText: (value, fallback) => /【539】/.test(value) ? "539" : fallback,
  eventWithGameSection: (section, play) => section ? `${section} / ${play}` : play,
  orderStatusFromText: () => "正常",
  enrichedBet: (base, extra) => ({ ...base, ...extra }),
  combinationCountFor: () => null,
};
vm.runInNewContext(`${scraper};globalThis.scrapeAmcOrders=scrapeAmcOrders`, context);

test("航海三星連柱碰保留網站名稱、全部號碼與網站碰數", () => {
  const pageText = `【539】 第 C115208 期
項次 玩法 下注內容 賠率 本金 每碰金額 碰數 下注金額
5 三星
連柱碰
2026-08-27 18:53:36
01,02,03,04,05,06,07,08,09,11
12,13,14,15,16,17,18,19,21,22
23,24,25,26,27,28,29,31,32,33
34,35,36,37,38,39
碰
10,20,30 570 62.5 50 1890 94500 0 -31.5 35406 59094
新增備註 單項金額總計
94500 0 -31.5 35406 59094`;
  const root = { body: { innerText: pageText }, querySelectorAll: () => [] };
  const rows = context.scrapeAmcOrders(root);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, "539 / 三星連柱碰");
  assert.equal(rows[0].playType, "三星連柱碰");
  assert.equal(rows[0].unitAmount, 50);
  assert.equal(rows[0].combinationCount, 1890);
  assert.equal(rows[0].betAmount, 94500);
  assert.match(rows[0].selection, /^01, 02, 03/);
  assert.match(rows[0].selection, /34, 35, 36, 37, 38, 39/);
  assert.match(rows[0].selection, /碰 10, 20, 30$/);
});

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const formatter = html.match(/function formatStructuredSelection[\s\S]*?(?=\nfunction isDeletedBet)/)?.[0];
assert.ok(formatter, "下注內容格式化函式必須存在");
const displayContext = { escapeHtml: value => String(value) };
vm.runInNewContext(`${formatter};globalThis.format=formatStructuredSelection`, displayContext);

test("連柱碰在同步器分行顯示全部號碼與碰撞號碼", () => {
  const rendered = displayContext.format("三星連柱碰", "01, 02、03, 04、碰 10, 20, 30", {});
  assert.match(rendered, /01, 02/);
  assert.match(rendered, /03, 04/);
  assert.match(rendered, /pillar-label">碰/);
  assert.match(rendered, /10, 20, 30/);
});
