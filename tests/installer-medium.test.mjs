import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const installer = readFileSync(resolve('../RuntimeData/Updater/Install-UpdateTask.ps1'), 'utf8');
const updater = readFileSync(resolve('../RuntimeData/Updater/Update-Synchronizer.ps1'), 'utf8');
const manual = readFileSync(resolve('../RuntimeData/雜/立即更新同步器.cmd'), 'utf8');

test('M10 安裝與更新對相同目標使用同一鎖，且安裝全程保護替換及 helper 複製', () => {
  assert.match(installer, /Enter-SynchronizerUpdateLock \$targetExtensionDir/);
  assert.match(installer, /Repair-SynchronizerUpdate \$targetExtensionDir/);
  assert.match(installer, /finally\s*\{\s*Exit-SynchronizerUpdateLock \$installLock/);
  const enter = installer.indexOf('Enter-SynchronizerUpdateLock $targetExtensionDir');
  const install = installer.indexOf('Install-ExtensionSafely $sourceExtensionDir.FullName $targetExtensionDir');
  const copy = installer.indexOf('Copy-Item -LiteralPath $sourceUpdaterPath');
  const release = installer.indexOf('Exit-SynchronizerUpdateLock $installLock');
  assert.ok(enter < install && install < copy && copy < release);
  assert.match(updater, /Enter-SynchronizerUpdateLock \$extensionDir/);
});

test('M10 手動執行僅讀專屬 runId 狀態，不刪共用狀態', () => {
  assert.match(updater, /\$runStatusFile\s*=\s*Join-Path \$logDir \(\$runId \+ '\.status\.json'\)/);
  assert.match(updater, /Set-Content -LiteralPath \$runStatusFile/);
  assert.match(manual, /SYNC_RUN_ID%\.status\.json/);
  assert.doesNotMatch(manual, /del \/f \/q "%SYNC_STATUS%"/i);
});
