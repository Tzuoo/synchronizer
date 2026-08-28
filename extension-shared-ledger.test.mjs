import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const content = await readFile(new URL("../RuntimeData/同步器擴充功能/content.js", import.meta.url), "utf8");
const background = await readFile(new URL("../RuntimeData/同步器擴充功能/background.js", import.meta.url), "utf8");
const source = content.match(/function scrapeSharedLedger[\s\S]*?(?=\nfunction storeLedgerSnapshot)/)?.[0];
assert.ok(source, "同型總帳解析器必須存在");

const node = value => ({ innerText: value, textContent: value });
const makeRow = (gameName, cells) => ({
  children: cells.map(node),
  closest: selector => selector === ".bet_group.f_group"
    ? { querySelector: query => query === ":scope > .panel_title" ? node(gameName) : null }
    : null,
});
const ledger = {
  querySelectorAll(selector) {
    if (selector === ".tr.tr-head .th") return ["期數 [ 日期 ]", "名稱", "總量", "退水", "中獎", "輸贏", "小計"].map(node);
    if (selector === ".tr.tr-body") return [
      makeRow("加拿大彩", ["第F2844期 >", "", "0", "0", "0", "0", "0"]),
      makeRow("六合", ["第S590期 >", "台號", "4500", "1125", "1720.0000762939", "-1654.9999237061", "-1654.9999237061"]),
      makeRow("539", ["第C115209期 >", "正碼", "3000", "750", "600", "-2400", "-2400"]),
    ];
    return [];
  },
};

const context = {
  location: { hostname: "www.vs968.net" },
  rootDomain: () => "vs968.net",
  SITE_NAMES: { "vs968.net": "風雲", "kd998.net": "喜" },
  taiwanDateKey: () => "2026-08-28",
  numeric: value => {
    const number = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(number) ? number : null;
  },
};
vm.runInNewContext(`${source};globalThis.scrape=scrapeSharedLedger`, context);

test("風雲同型總帳依網站原始遊戲分區保存", () => {
  const rows = context.scrape({ querySelector: selector => selector === "#ledger_01" ? ledger : null }, new Date("2026-08-28T00:00:00Z"));
  assert.equal(rows.length, 2, "沒有玩法的加拿大彩列不可以當成已確認的 0");
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row => [row.gameName, row.phaseName, row.playType, row.totalAmount, row.winningAmount]))), [
    ["六合", "第S590期", "台號", 4500, 1720.0000762939],
    ["539", "第C115209期", "正碼", 3000, 600],
  ]);
});

test("喜與風雲共用表頭解析但網站來源不可混用", () => {
  assert.match(source, /\["kd998\.net", "vs968\.net"\]/);
  assert.match(source, /SITE_NAMES\[domain\]/);
  assert.match(background, /row\.gameName, row\.phaseName, row\.playType/);
});

test("航海使用已確認的 A07 路由並保留網站回傳玩法順序", () => {
  assert.match(content, /"umh693\.com", "pee688\.com"/);
  assert.match(content, /return `\$\{location\.origin\}\$\{prefix\}\/Front\/A\/A07`/);
  assert.match(background, /\.map\(\(row, sourceOrder\) =>/);
  assert.match(background, /root: domain, sourceOrder/);
});
