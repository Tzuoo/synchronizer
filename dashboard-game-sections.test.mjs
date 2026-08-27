import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = html.match(/function gameSectionOf[\s\S]*?(?=\nfunction renderBetRows)/)?.[0];
assert.ok(source, "game section ordering functions must be present");
const context = {};
vm.runInNewContext(`${source};globalThis.gameSectionOf=gameSectionOf;globalThis.orderByGameSection=orderByGameSection`, context);

test("盤口名稱不改動訂單玩法名稱", () => {
  const bet = { event: "六合 / 二星連碰", playType: "二星連碰" };
  assert.equal(context.gameSectionOf(bet), "六合");
  assert.equal(bet.playType, "二星連碰");
});

test("單站依網站首次出現的盤口分區且區內順序不變", () => {
  const rows = [
    { id: "539-1", event: "539 / 四星連碰" },
    { id: "six-1", event: "六合 / 天碰二連碰" },
    { id: "539-2", event: "539 / 二星柱碰" },
    { id: "six-2", event: "六合 / 天碰三連碰" },
  ];
  assert.deepEqual(Array.from(context.orderByGameSection(rows), row => row.id), ["539-1", "539-2", "six-1", "six-2"]);
});

test("風雲既有六合合併批次仍辨識為六合", () => {
  assert.equal(context.gameSectionOf({ event: "台號", playType: "台號", _sixBatch: true }), "六合");
});
