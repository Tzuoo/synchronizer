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
  assert.match(html, /synchronizerClientMonitorCollapsedV1/);
  assert.match(html, /toggle\.textContent=collapsed\?'展開':'縮小'/);
  assert.match(html, /client-monitor\.collapsed \.client-list\{display:none\}/);
  assert.match(html, /synchronizerMobileMetaHiddenV1/);
  assert.match(html, /隱藏時間／網站／帳號/);
  assert.match(html, /body\.mobile-meta-hidden #betsTable tbody tr:not\(\.game-section-row\) td:nth-child\(6\)/);
});
