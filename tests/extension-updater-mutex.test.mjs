import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const safeFile = fileURLToPath(new URL('../../RuntimeData/Updater/Safe-ExtensionFiles.ps1', import.meta.url));
const updaterFile = fileURLToPath(new URL('../../RuntimeData/Updater/Update-Synchronizer.ps1', import.meta.url));
const manualFile = fileURLToPath(new URL('../../RuntimeData/雜/立即更新同步器.cmd', import.meta.url));
const safeSource = await readFile(safeFile, 'utf8');
const updaterSource = await readFile(updaterFile, 'utf8');
const manualSource = await readFile(manualFile, 'utf8');

function runPowerShell(script, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('PowerShell timeout')); }, timeout);
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

test('H9 updater 宣告目標範圍跨程序鎖、執行識別與完成後驗證', { skip: process.platform !== 'win32' }, () => {
  assert.match(safeSource, /function New-SynchronizerUpdateMutexName/);
  assert.match(safeSource, /function Enter-SynchronizerUpdateLock/);
  assert.match(safeSource, /AbandonedMutexException/);
  assert.match(safeSource, /function Exit-SynchronizerUpdateLock/);
  assert.match(safeSource, /function Assert-ManagedExtension/);
  assert.match(updaterSource, /Enter-SynchronizerUpdateLock/);
  assert.match(updaterSource, /finally[\s\S]*Exit-SynchronizerUpdateLock/);
  assert.match(updaterSource, /runId/);
  assert.match(updaterSource, /invocation/);
  assert.match(updaterSource, /processId/);
  assert.match(updaterSource, /Assert-ManagedExtension/);
  assert.match(manualSource, /-Invocation manual/);
  assert.match(manualSource, /-RunId/);
  assert.match(manualSource, /\$r\.runId -ne \$env:SYNC_RUN_ID/);
  assert.ok(updaterSource.indexOf('Enter-SynchronizerUpdateLock') < updaterSource.indexOf('DownloadString'));
});

test('H9 手動與排程或兩個手動同時開始時，同一目標只能一個進入', { skip: process.platform !== 'win32' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sync-updater-lock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const target = join(dir, 'RuntimeData', 'SynchronizerExtension');
  const escapedSafe = safeFile.replaceAll("'", "''");
  const escapedTarget = target.replaceAll("'", "''");
  for (const labels of [['scheduled', 'manual'], ['manual-a', 'manual-b']]) {
    const firstScript = `$ErrorActionPreference='Stop';. '${escapedSafe}';$l=Enter-SynchronizerUpdateLock '${escapedTarget}' 5000;try{Write-Output ('${labels[0]}:'+[DateTime]::UtcNow.Ticks);Start-Sleep -Milliseconds 650}finally{Exit-SynchronizerUpdateLock $l}`;
    const secondScript = `$ErrorActionPreference='Stop';. '${escapedSafe}';$l=Enter-SynchronizerUpdateLock '${escapedTarget}' 5000;try{Write-Output ('${labels[1]}:'+[DateTime]::UtcNow.Ticks)}finally{Exit-SynchronizerUpdateLock $l}`;
    const first = runPowerShell(firstScript);
    await new Promise(resolve => setTimeout(resolve, 100));
    const second = runPowerShell(secondScript);
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.code, 0, a.stdout + a.stderr);
    assert.equal(b.code, 0, b.stdout + b.stderr);
    const aTicks = BigInt(a.stdout.trim().split(':').at(-1));
    const bTicks = BigInt(b.stdout.trim().split(':').at(-1));
    assert.ok(bTicks - aTicks >= 4_000_000n, `${labels.join('+')} did not serialize`);
  }
});

test('H9 單一手動與排程均可執行，等待者取得鎖後重新讀取已安裝版本', { skip: process.platform !== 'win32' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sync-updater-recheck-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const target = join(dir, 'RuntimeData', 'SynchronizerExtension').replaceAll("'", "''");
  const versionFile = join(dir, 'version.txt').replaceAll("'", "''");
  const safe = safeFile.replaceAll("'", "''");
  for (const invocation of ['scheduled', 'manual']) {
    const single = await runPowerShell(`$ErrorActionPreference='Stop';. '${safe}';$l=Enter-SynchronizerUpdateLock '${target}' 1000;try{Write-Output '${invocation}-ok'}finally{Exit-SynchronizerUpdateLock $l}`);
    assert.equal(single.code, 0, single.stdout + single.stderr);
    assert.match(single.stdout, new RegExp(`${invocation}-ok`));
  }
  const first = runPowerShell(`$ErrorActionPreference='Stop';Set-Content -LiteralPath '${versionFile}' -Value '1';. '${safe}';$l=Enter-SynchronizerUpdateLock '${target}' 5000;try{Start-Sleep -Milliseconds 500;Set-Content -LiteralPath '${versionFile}' -Value '2'}finally{Exit-SynchronizerUpdateLock $l}`);
  await new Promise(resolve => setTimeout(resolve, 100));
  const waiter = runPowerShell(`$ErrorActionPreference='Stop';. '${safe}';$l=Enter-SynchronizerUpdateLock '${target}' 5000;try{Write-Output ('seen='+(Get-Content -LiteralPath '${versionFile}' -Raw).Trim())}finally{Exit-SynchronizerUpdateLock $l}`);
  const [a, b] = await Promise.all([first, waiter]);
  assert.equal(a.code, 0, a.stdout + a.stderr);
  assert.equal(b.code, 0, b.stdout + b.stderr);
  assert.match(b.stdout, /seen=2/);
});

test('H9 lock owner 失敗或異常結束後不留下死鎖', { skip: process.platform !== 'win32' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sync-updater-abandon-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const target = join(dir, 'RuntimeData', 'SynchronizerExtension').replaceAll("'", "''");
  const safe = safeFile.replaceAll("'", "''");
  const failed = await runPowerShell(`$ErrorActionPreference='Stop';. '${safe}';$l=Enter-SynchronizerUpdateLock '${target}' 1000;try{throw 'simulated'}catch{}finally{Exit-SynchronizerUpdateLock $l}`);
  assert.equal(failed.code, 0, failed.stdout + failed.stderr);
  const afterFailure = await runPowerShell(`$ErrorActionPreference='Stop';. '${safe}';$l=Enter-SynchronizerUpdateLock '${target}' 1000;try{Write-Output 'recovered'}finally{Exit-SynchronizerUpdateLock $l}`);
  assert.equal(afterFailure.code, 0, afterFailure.stdout + afterFailure.stderr);
  assert.match(afterFailure.stdout, /recovered/);

  const abandoned = await runPowerShell(`$ErrorActionPreference='Stop';. '${safe}';$l=Enter-SynchronizerUpdateLock '${target}' 1000;Write-Output 'owned';[Environment]::Exit(7)`);
  assert.equal(abandoned.code, 7, abandoned.stdout + abandoned.stderr);
  const afterAbandon = await runPowerShell(`$ErrorActionPreference='Stop';. '${safe}';$l=Enter-SynchronizerUpdateLock '${target}' 1000;try{Write-Output 'abandoned-recovered'}finally{Exit-SynchronizerUpdateLock $l}`);
  assert.equal(afterAbandon.code, 0, afterAbandon.stdout + afterAbandon.stderr);
  assert.match(afterAbandon.stdout, /abandoned-recovered/);
});
