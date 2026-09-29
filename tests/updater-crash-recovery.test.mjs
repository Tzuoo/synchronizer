import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
const helper = resolve('../RuntimeData/Updater/Safe-ExtensionFiles.ps1');
const quote = s => "'" + s.replaceAll("'", "''") + "'";
const ps = code => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 30000 });

test('D-01 強制中止在 target→backup 後，實際 updater 下次鎖內能恢復並保留備份', async () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'SyncCrashTest-'));
  const runtime = join(sandbox, 'RuntimeData');
  const target = join(runtime, 'extension');
  const source = join(sandbox, 'source');
  mkdirSync(target, { recursive: true }); mkdirSync(source);
  writeFileSync(join(target, 'manifest.json'), '{"version":"1.0.0"}');
  writeFileSync(join(target, 'private-setting.txt'), 'synthetic-preserved');
  const files = {};
  for (const name of ['manifest.json', 'background.js', 'content.js', 'config.js']) {
    const text = name === 'manifest.json' ? '{"version":"2.0.0"}' : '// synthetic-new';
    writeFileSync(join(source, name), text);
    files[name] = createHash('sha256').update(text).digest('hex');
  }
  writeFileSync(join(source, 'managed-files.json'), JSON.stringify({ schemaVersion: 1, files }));
  try {
    const killed = ps(`$ErrorActionPreference='Stop'; . ${quote(helper)}; function Move-Item { param($LiteralPath,$Destination) Microsoft.PowerShell.Management\\Move-Item -LiteralPath $LiteralPath -Destination $Destination; if($Destination -like '*.backup-*') { [Diagnostics.Process]::GetCurrentProcess().Kill() } }; $lock=Enter-SynchronizerUpdateLock ${quote(target)}; Install-ManagedExtension ${quote(source)} ${quote(target)}`);
    assert.equal(existsSync(target), false, killed.stderr);
    const updaterDir = join(runtime, 'Updater'); mkdirSync(updaterDir);
    copyFileSync(helper, join(updaterDir, 'Safe-ExtensionFiles.ps1'));
    copyFileSync(resolve('../RuntimeData/Updater/Update-Synchronizer.ps1'), join(updaterDir, 'Update-Synchronizer.ps1'));
    const server = createServer((_req, res) => res.end(JSON.stringify({ version: '2.0.0', url: 'http://127.0.0.1/unused', sha256: '0'.repeat(64) })));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(updaterDir, 'Update-Synchronizer.ps1'), '-VersionUrl', `http://127.0.0.1:${server.address().port}/version`, '-Invocation', 'manual'], { env: { ...process.env, LOCALAPPDATA: sandbox }, windowsHide: true, timeout: 30000 });
    } finally { await new Promise(resolve => server.close(resolve)); }
    assert.equal(JSON.parse(readFileSync(join(sandbox, 'SynchronizerUpdater/status.json'), 'utf8').replace(/^\uFEFF/, '')).state, 'restart-required');
    assert.equal(readFileSync(join(target, 'manifest.json'), 'utf8'), '{"version":"2.0.0"}');
    const backups = readdirSync(runtime).filter(name => name.includes('.backup-'));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(runtime, backups[0], 'private-setting.txt'), 'utf8'), 'synthetic-preserved');
    assert.equal(existsSync(join(runtime, '.extension.update-journal.json')), false);
    const again = ps(`$ErrorActionPreference='Stop'; . ${quote(helper)}; $lock=Enter-SynchronizerUpdateLock ${quote(target)}; try { Repair-SynchronizerUpdate ${quote(target)} } finally { Exit-SynchronizerUpdateLock $lock }`);
    assert.equal(again.status, 0, again.stderr);
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});
