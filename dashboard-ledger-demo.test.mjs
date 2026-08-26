import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = html.match(/const LEDGER_DEMO=[\s\S]*?(?=\nfunction getBetAmount)/)?.[0];
assert.ok(source, "ledger demo fixture and helpers must be present");
const context = {};
vm.runInNewContext(`${source};globalThis.demo=LEDGER_DEMO;globalThis.summarizeLedger=summarizeLedger`, context);

test("昨日四站總帳依網站原始玩法加總", () => {
  const rows = context.summarizeLedger(context.demo.sites);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    ["正碼", 110960, 26500, [["喜", 110960, 26500]]],
    ["全車", 7790, 2120, [["98", 2280, 2120], ["海勝", 5510, 0]]],
    ["二星", 11000, 0, [["海勝", 8000, 0], ["16", 3000, 0]]],
    ["三星", 14000, 0, [["98", 3000, 0], ["海勝", 9000, 0], ["16", 2000, 0]]],
    ["四星", 17300, 0, [["98", 17300, 0]]],
  ]);
  assert.deepEqual(rows.reduce((sum, row) => [sum[0] + row[1], sum[1] + row[2]], [0, 0]), [161050, 28620]);
});

test("喜的群組期別不會被當成帳號", () => {
  const joy = context.demo.sites.find(site => site.source === "喜");
  assert.equal(joy.account, "a0593");
  assert.equal(context.demo.phase, "C115207");
});
