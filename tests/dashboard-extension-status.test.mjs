import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const version = JSON.parse(await readFile(new URL("../version.json", import.meta.url), "utf8"));
const diagnostics = await readFile(new URL("../remote-diagnostics.js", import.meta.url), "utf8");

test("版本監測混合新舊來源鍵只顯示一次網站且保留裝置與離線狀態", () => {
  const element = { innerHTML: '' };
  const context = vm.createContext({ Date, Set, Map, $: () => element, latestExtensionVersion: '1.6.70', clientStatusRows: [], remoteDeviceLabel: id => `家裡 · ${id.slice(-8)}` });
  vm.runInContext(diagnostics.slice(diagnostics.indexOf('const diagnosticSiteNames'), diagnostics.indexOf('function remoteDeviceLabel')), context);
  for (const name of ['escapeHtml', 'compareVersions', 'renderClientStatus']) {
    vm.runInContext(html.split(/\r?\n/).find(line => line.startsWith(`function ${name}(`)), context);
  }
  const id = '2c5886a8-823e-47ed-b297-344aa2b538b5';
  context.rows = ['188hot.net', `${id}|188hot.net`, 'vs968.net', `${id}|vs968.net`].map(site => ({ installationId: id, site, extensionVersion: '1.6.68', lastSeen: '2026-09-13T00:01:10Z' }));
  vm.runInContext('renderClientStatus(rows)', context);
  assert.match(element.innerHTML, /網站 16、風雲/);
  assert.doesNotMatch(element.innerHTML, /188hot|vs968|2c5886a8|\|/);
  assert.match(element.innerHTML, /家裡 · a2b538b5/);
  assert.match(element.innerHTML, /已離線/);
  assert.match(element.innerHTML, /執行版本 1.6.68/);
  assert.equal(vm.runInContext("clientSiteLabel('device|unknown.example')", context), 'unknown.example');
});

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
  assert.equal(html.match(/const BUILD="(\d+)"/)?.[1], String(version.build));
  assert.equal(html.match(/<style>/g)?.length, 1);
  assert.match(html, /<\/style><\/head><body>/);
});
