import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = html.match(/function gameColorClass[\s\S]*?(?=\nfunction ledgerRowCompare)/)?.[0];
assert.ok(source, "盤口顏色與總帳排序函式必須存在");
const context = {};
vm.runInNewContext(`${source};globalThis.gameColorClass=gameColorClass;globalThis.gameDisplayCompare=gameDisplayCompare`, context);

test("539 與六合使用固定且不同的盤口顏色", () => {
  assert.equal(context.gameColorClass("539"), "game-539");
  assert.equal(context.gameColorClass("六合"), "game-six");
  assert.notEqual(context.gameColorClass("539"), context.gameColorClass("六合"));
  assert.match(html, /\.game-tag\.game-539/);
  assert.match(html, /\.game-tag\.game-six/);
  assert.match(html, /bet-\$\{gameClass\}/);
  assert.match(html, /\.bet-game-539 td\{background:/);
  assert.match(html, /\.bet-game-six td\{background:/);
  assert.match(html, /\.ledger-game\.game-539\{background:/);
  assert.match(html, /\.ledger-game\.game-six\{background:/);
});

test("盤口整列底色不會蓋掉已對帳與已刪單狀態", () => {
  assert.match(html, /\.bet-game-539\.reconciled-row td/);
  assert.match(html, /\.bet-game-six\.reconciled-row td/);
  assert.match(html, /\.bet-game-539\.deleted-row td,\.bet-game-six\.deleted-row td/);
});

test("手機盤口標題不套用項次絕對定位而獨立佔滿一列", () => {
  assert.match(html, /tbody tr\.game-section-row\{display:block!important;position:static/);
  assert.match(html, /tbody tr\.game-section-row td:first-child\{display:block!important;position:static;width:100%!important/);
  assert.match(html, /tbody tr\.game-section-row td:first-child::after\{content:none\}/);
});

test("總帳固定 539 在六合前且其他盤口仍穩定排列", () => {
  const games = ["六合", "大樂", "539", "加州彩"].sort(context.gameDisplayCompare);
  assert.deepEqual(JSON.parse(JSON.stringify(games)), ["539", "六合", "大樂", "加州彩"]);
  assert.match(html, /\.sort\(gameDisplayCompare\)/);
});

test("下注明細仍只在選定單站時依網站首次出現盤口分組", () => {
  assert.match(html, /site==="全部網站"\?matched:orderByGameSection\(matched\)/);
  assert.match(html, /const groups=new Map\(\),order=\[\]/);
});
