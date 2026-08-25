import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = html.match(/function escapeHtml[\s\S]*?(?=\nfunction isDeletedBet)/)?.[0];
assert.ok(source, "structured selection functions must be present");
const context = {
  money: (value) => `$${Number(value).toLocaleString("en-US")}`,
};
vm.runInNewContext(`${source};globalThis.formatStructuredSelection=formatStructuredSelection`, context);

test("天碰同批各組依 rawText 顯示自己的每碰金額", () => {
  const selection = "特碼 02／正碼 48\n特碼 10／正碼 31\n特碼 12／正碼 27";
  const rawText = [
    "特碼 02 正碼 48 240 63 100 1 100 0 0 37 63",
    "特碼 10 正碼 31 240 63 200 1 200 0 0 74 126",
    "特碼 12 正碼 27 240 63 300 1 300 0 0 111 189",
  ].join("\n");
  const output = context.formatStructuredSelection("天碰二單碰", selection, { rawText });
  assert.equal((output.match(/class="sky-group"/g) || []).length, 3);
  assert.match(output, /特碼<\/div><div class="pillar-values">02/);
  assert.match(output, /正碼<\/div><div class="pillar-values">48/);
  assert.match(output, /\$100/);
  assert.match(output, /\$200/);
  assert.match(output, /\$300/);
});

test("無法辨識個別金額時不猜成整批金額", () => {
  const output = context.formatStructuredSelection(
    "天碰二單碰",
    "特碼 02／正碼 48\n特碼 10／正碼 31",
    { rawText: "" },
  );
  assert.equal((output.match(/未辨識/g) || []).length, 2);
});
