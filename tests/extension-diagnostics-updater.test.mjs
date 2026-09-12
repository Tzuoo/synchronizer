import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const background = await readFile(new URL("RuntimeData/同步器擴充功能/background.js", root), "utf8");
const content = await readFile(new URL("RuntimeData/同步器擴充功能/content.js", root), "utf8");
const popup = await readFile(new URL("RuntimeData/同步器擴充功能/popup.js", root), "utf8");
const popupHtml = await readFile(new URL("RuntimeData/同步器擴充功能/popup.html", root), "utf8");
const installer = await readFile(new URL("RuntimeData/Updater/Install-UpdateTask.ps1", root), "utf8");
const updater = await readFile(new URL("RuntimeData/Updater/Update-Synchronizer.ps1", root), "utf8");

test("風雲與喜逐站保存診斷，但彈窗不重複顯示完整內容", () => {
  assert.match(background, /siteDiagnostics/);
  assert.match(background, /uploadOk: state\.ok/);
  assert.match(content, /等待開啟一次網站下注明細/);
  assert.match(content, /收到回應但解析為 0 筆/);
  assert.match(content, /wakeAt: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(popupHtml, /id="diagnostics"|網站診斷/);
  assert.doesNotMatch(popup, /diagnosticNames|siteDiagnostics/);
  assert.match(popupHtml, /完整內容請至同步器網頁查看/);
  assert.doesNotMatch(popup, /innerHTML/);
});

test("更新器只在登入檢查且明確記錄需重啟", () => {
  assert.match(installer, /Triggers\.Create\(9\)/);
  assert.doesNotMatch(installer, /PT15M|\$task\.Run\(/);
  assert.match(installer, /\$taskName = 'SynchronizerBackgroundUpdate'/);
  assert.match(installer, /Remove-ItemProperty -Path \$runKey -Name \$taskName/);
  assert.match(updater, /restart-required/);
  assert.match(updater.replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16))), /請完整重新啟動 Chrome/);
  assert.match(updater, /status\.json/);
});
