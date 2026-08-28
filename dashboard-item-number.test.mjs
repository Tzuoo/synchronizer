import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const extension = await readFile(new URL("../RuntimeData/同步器擴充功能/content.js", import.meta.url), "utf8");

test("同步器以最前方獨立欄位顯示網站原始項次", () => {
  assert.match(html, /<th>項次<\/th><th>投注內容<\/th>/);
  assert.match(html, /<col style="width:52px"><col>/);
  assert.match(html, /grid-template-columns:minmax\(48px,auto\)/);
  assert.match(html, /DEFAULT_COLUMN_WIDTHS=\[52,378,105,105,120,130,95,80\]/);
  assert.match(html, /saved\.length===8/);
  assert.match(html, /<td class="item-cell">\$\{b\.itemNumber\?escapeHtml\(b\.itemNumber\):''\}<\/td><td><b>/);
  assert.doesNotMatch(html, /itemBadge/);
  assert.match(html, /b\.betAmount,b\.itemNumber,b\.parseStatus/);
});

test("擴充只從明細項次欄或同批 DOM 取得項次", () => {
  assert.match(extension, /function exactItemNumber/);
  assert.match(extension, /itemNumberFromOrderContext/);
  assert.match(extension, /rowKey\.includes\(dateKey\)/);
  assert.match(extension, /exactItemNumber\(number\)/);
  assert.match(extension, /itemNumber: directPillar\?\.itemNumber \?\? itemNumberFromOrderContext\(root, dateTime, play\)/);
});

test("項次必須與同一列的日期及原始玩法同時相符", () => {
  const exact = extension.match(/function exactItemNumber[\s\S]*?(?=\nfunction itemNumberFromOrderContext)/)?.[0];
  const lookup = extension.match(/function itemNumberFromOrderContext[\s\S]*?(?=\nfunction gameSectionFromText)/)?.[0];
  assert.ok(exact && lookup);
  const row = { innerText: "43 三星連柱碰 2026-08-28\n20:11:23" };
  const cell = { innerText: "43", closest: () => row };
  const root = { querySelectorAll: () => [cell] };
  const context = {};
  vm.runInNewContext(`${exact}\n${lookup}\nglobalThis.lookup=itemNumberFromOrderContext`, context);
  assert.equal(context.lookup(root, "2026-08-28 20:11:23", "三星連柱碰"), "43");
  assert.equal(context.lookup(root, "2026-08-28 20:11:23", "二星連碰"), null);
});
