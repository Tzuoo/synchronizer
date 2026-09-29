import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const quote = s => "'" + s.replaceAll("'", "''") + "'";
test('D-02 實際打包入口只包含 inventory，未知 sentinel 不進 ZIP', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'SyncPackageTest-'));
  const source = join(sandbox, 'extension'); mkdirSync(source);
  const zip = join(sandbox, 'test.zip');
  const inventory = { schemaVersion: 1, files: {} };
  for (const name of ['manifest.json', 'background.js', 'content.js', 'config.js']) {
    writeFileSync(join(source, name), 'synthetic');
    inventory.files[name] = createHash('sha256').update('synthetic').digest('hex');
  }
  writeFileSync(join(source, 'managed-files.json'), JSON.stringify(inventory));
  writeFileSync(join(source, 'unknown-sentinel.txt'), 'NOT-A-SECRET');
  const helper = resolve('../發布工具/Extension-Package.ps1');
  const build = readFileSync(resolve('../發布工具/Build-ExtensionUpdate.ps1'), 'utf8');
  const pack = build.includes('New-ManagedExtensionPackage') && existsSync(helper)
    ? `. ${quote(helper)}; New-ManagedExtensionPackage ${quote(source)} ${quote(zip)}`
    : `Compress-Archive -Path ${quote(join(source, '*'))} -DestinationPath ${quote(zip)}`;
  try {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(`$ErrorActionPreference='Stop'; ${pack}; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip=[IO.Compression.ZipFile]::OpenRead(${quote(zip)}); try { @($zip.Entries | ForEach-Object {$_.FullName.Replace('\\','/')}) | ConvertTo-Json -Compress } finally {$zip.Dispose()}`, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()).sort(), [...Object.keys(inventory.files), 'managed-files.json'].sort());
  } finally { rmSync(sandbox, { recursive: true, force: true }); }
});
