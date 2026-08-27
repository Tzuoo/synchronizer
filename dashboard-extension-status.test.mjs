import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");

test("網頁顯示最新版、需更新與離線狀態", () => {
  assert.match(html, /id="clientMonitor"/);
  assert.match(html, /需要更新/);
  assert.match(html, /已離線/);
  assert.match(html, /執行版本/);
  assert.match(html, /setInterval\(loadClientStatus,10000\)/);
});
