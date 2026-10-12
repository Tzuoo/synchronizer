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

function startPowerShell(script, timeout = 15000) {
  let child, stdout = '', stderr = '', closed = false;
  const waiters = new Set();
  const notify = () => { for (const check of [...waiters]) check(); };
  const completion = new Promise((resolve, reject) => {
    child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
    child.stdout.on('data', chunk => { stdout += chunk; notify(); });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('PowerShell timeout')); }, timeout);
    child.on('error', error => { clearTimeout(timer); closed = true; notify(); reject(error); });
    child.on('close', code => { clearTimeout(timer); closed = true; notify(); resolve({ code, stdout, stderr }); });
  });
  // A failure may occur while the test awaits a readiness signal instead of completion.
  completion.catch(() => {});
  return {
    completion,
    waitForLine(prefix) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error(`Missing signal ${prefix}: ${stdout}${stderr}`)), timeout);
        const finish = (error, line) => {
          clearTimeout(timer); waiters.delete(check);
          if (error) reject(error); else resolve(line);
        };
        const check = () => {
          const line = stdout.split(/\r?\n/).find(value => value.startsWith(prefix));
          if (line !== undefined) finish(null, line);
          else if (closed) finish(new Error(`Exited before ${prefix}: ${stdout}${stderr}`));
        };
        waiters.add(check); check();
      });
    },
    sendLine(line) { child.stdin.write(line + '\n'); },
    stop() { if (!closed) child.kill(); return completion.catch(() => {}); },
  };
}

function runPowerShell(script, timeout) { return startPowerShell(script, timeout).completion; }

async function verifyContendedLock(t, target, onRelease = '', afterAcquire = '', waiterTarget = target) {
  const safe = safeFile.replaceAll("'", "''");
  const escapedTarget = target.replaceAll("'", "''");
  const escapedWaiterTarget = waiterTarget.replaceAll("'", "''");
  const owner = startPowerShell(`$ErrorActionPreference='Stop';. '${safe}';Start-Sleep -Milliseconds 900;$l=Enter-SynchronizerUpdateLock '${escapedTarget}' 5000;try{[Console]::WriteLine('OWNED');if([Console]::ReadLine() -ne 'release'){throw 'Missing release signal'};${onRelease};[Console]::WriteLine('LEAVING:'+[DateTime]::UtcNow.Ticks)}finally{Exit-SynchronizerUpdateLock $l}`);
  t.after(() => owner.stop());
  await owner.waitForLine('OWNED');
  const waiter = startPowerShell(`$ErrorActionPreference='Stop';. '${safe}';$probe=$null;try{$probe=Enter-SynchronizerUpdateLock '${escapedWaiterTarget}' 150}catch{if($_.Exception.Message -ne 'Another updater is still using this extension target.'){throw};[Console]::WriteLine('BLOCKED')};if($probe){Exit-SynchronizerUpdateLock $probe;throw 'Entered while owner held target'};$l=Enter-SynchronizerUpdateLock '${escapedWaiterTarget}' 5000;try{[Console]::WriteLine('ENTERED:'+[DateTime]::UtcNow.Ticks);${afterAcquire}}finally{Exit-SynchronizerUpdateLock $l}`);
  t.after(() => waiter.stop());
  await waiter.waitForLine('BLOCKED');
  owner.sendLine('release');
  const [a, b] = await Promise.all([owner.completion, waiter.completion]);
  assert.equal(a.code, 0, a.stdout + a.stderr);
  assert.equal(b.code, 0, b.stdout + b.stderr);
  const leaving = BigInt(a.stdout.match(/LEAVING:(\d+)/)[1]);
  const entered = BigInt(b.stdout.match(/ENTERED:(\d+)/)[1]);
  assert.ok(entered >= leaving, 'waiter entered before owner left its critical section');
  return b;
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
  for (const labels of [['scheduled', 'manual'], ['manual-a', 'manual-b']]) {
    await t.test(labels.join('+'), async sub => { await verifyContendedLock(sub, target); });
  }
});

test('H9 同步測試不得讓錯誤鎖 scope 冒充互斥成功', { skip: process.platform !== 'win32' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sync-updater-lock-negative-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // Fault injection only changes the test contender's target, never production code.
  await assert.rejects(verifyContendedLock(t, join(dir, 'target'), '', '', join(dir, 'wrong-target')),
    /Entered while owner held target/);
});

test('H9 單一手動與排程均可執行，等待者取得鎖後重新讀取已安裝版本', { skip: process.platform !== 'win32' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sync-updater-recheck-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const targetDirectory = join(dir, 'RuntimeData', 'SynchronizerExtension');
  const target = targetDirectory.replaceAll("'", "''");
  const versionFile = join(dir, 'version.txt').replaceAll("'", "''");
  const safe = safeFile.replaceAll("'", "''");
  for (const invocation of ['scheduled', 'manual']) {
    const single = await runPowerShell(`$ErrorActionPreference='Stop';. '${safe}';$l=Enter-SynchronizerUpdateLock '${target}' 1000;try{Write-Output '${invocation}-ok'}finally{Exit-SynchronizerUpdateLock $l}`);
    assert.equal(single.code, 0, single.stdout + single.stderr);
    assert.match(single.stdout, new RegExp(`${invocation}-ok`));
  }
  const initial = await runPowerShell(`Set-Content -LiteralPath '${versionFile}' -Value '1'`);
  assert.equal(initial.code, 0, initial.stdout + initial.stderr);
  const b = await verifyContendedLock(t, targetDirectory, `Set-Content -LiteralPath '${versionFile}' -Value '2'`, `Write-Output ('seen='+(Get-Content -LiteralPath '${versionFile}' -Raw).Trim())`);
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
