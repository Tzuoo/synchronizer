import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, access } from 'node:fs/promises';

test('測試集中 tests，正式更新入口與既有網址路徑不搬動', async () => {
  const web = new URL('../', import.meta.url);
  assert.equal((await readdir(web)).filter(name => name.endsWith('.test.mjs')).length, 0);
  for (const name of ['index.html','ledger-calculator.js','remote-diagnostics.js','version.json','extension-version.json','synchronizer-extension.zip']) await access(new URL(name, web));
  const version = JSON.parse((await readFile(new URL('extension-version.json', web),'utf8')).replace(/^\uFEFF/,''));
  assert.equal(version.url, 'https://tzuoo.github.io/synchronizer/synchronizer-extension.zip');
});

test('打包入口與發布工具皆指向集中後的打包腳本', async () => {
  const project = new URL('../../', import.meta.url);
  await access(new URL('發布工具/Build-ExtensionUpdate.ps1', project));
  const launcher = await readFile(new URL('建立擴充更新包.cmd',project),'utf8');
  const publish = await readFile(new URL('發布工具/Publish-Synchronizer.ps1',project),'utf8');
  assert.ok(launcher.includes('發布工具\\Build-ExtensionUpdate.ps1'));
  assert.ok(publish.includes("Join-Path $toolDir 'Build-ExtensionUpdate.ps1'"));
});
