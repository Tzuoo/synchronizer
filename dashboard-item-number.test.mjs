import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const extension = await readFile(new URL("../RuntimeData/同步器擴充功能/content.js", import.meta.url), "utf8");

test("同步器在玩法旁顯示網站原始項次", () => {
  assert.match(html, /itemNumber\?`<span class="item-badge">項次 \$\{escapeHtml\(b\.itemNumber\)\}<\/span>`/);
  assert.match(html, /b\.betAmount,b\.itemNumber,b\.parseStatus/);
});

test("擴充只從明細項次欄或同批 DOM 取得項次", () => {
  assert.match(extension, /function exactItemNumber/);
  assert.match(extension, /itemNumberFromOrderContext/);
  assert.match(extension, /rowText\.includes\(date\)/);
  assert.match(extension, /exactItemNumber\(number\)/);
});

test("項次必須與同一列的日期及原始玩法同時相符", () => {
  const exact = extension.match(/function exactItemNumber[\s\S]*?(?=\nfunction itemNumberFromOrderContext)/)?.[0];
  const lookup = extension.match(/function itemNumberFromOrderContext[\s\S]*?(?=\nfunction gameSectionFromText)/)?.[0];
  assert.ok(exact && lookup);
  const row = { innerText: "43 三星連柱碰 2026-08-28 20:11:23" };
  const cell = { innerText: "43", closest: () => row };
  const root = { querySelectorAll: () => [cell] };
  const context = {};
  vm.runInNewContext(`${exact}\n${lookup}\nglobalThis.lookup=itemNumberFromOrderContext`, context);
  assert.equal(context.lookup(root, "2026-08-28 20:11:23", "三星連柱碰"), "43");
  assert.equal(context.lookup(root, "2026-08-28 20:11:23", "二星連碰"), null);
});
