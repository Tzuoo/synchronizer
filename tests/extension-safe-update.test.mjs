import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Windows 真實檔案替換：清除舊補丁、保留備份與設定、拒絕損壞包、失敗還原', { skip: process.platform !== 'win32' }, () => {
  const helper = fileURLToPath(new URL('../../RuntimeData/Updater/Safe-ExtensionFiles.ps1', import.meta.url));
  const script = `
$ErrorActionPreference='Stop'
. '${helper.replaceAll("'", "''")}'
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('SyncSafeTest-' + [guid]::NewGuid().ToString('N'))
$runtime = Join-Path $sandbox 'RuntimeData'
$target = Join-Path $runtime 'extension'
$source = Join-Path $sandbox 'source'
New-Item -ItemType Directory -Path $target,$source -Force | Out-Null
try {
  foreach($name in @('manifest.json','background.js','content.js','config.js')) { Set-Content -LiteralPath (Join-Path $source $name) -Value 'new-program' -Encoding ASCII }
  $hashes = [ordered]@{}
  foreach($file in Get-ChildItem -LiteralPath $source -File) { $hashes[$file.Name]=Get-ManagedFileHash $file.FullName }
  @{schemaVersion=1;files=$hashes}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $source 'managed-files.json') -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $source 'stray-patch.js') -Value 'not-managed'
  Set-Content -LiteralPath (Join-Path $target 'manifest.json') -Value 'old-program'
  Set-Content -LiteralPath (Join-Path $target 'retired-patch.js') -Value 'old-patch'
  Set-Content -LiteralPath (Join-Path $target 'private-setting.json') -Value 'keep-me'
  Set-Content -LiteralPath (Join-Path $runtime 'company-settings.json') -Value 'company'
  $backup = Install-ManagedExtension $source $target
  if(Test-Path -LiteralPath (Join-Path $target 'retired-patch.js')) {throw 'Retired patch survived'}
  if(Test-Path -LiteralPath (Join-Path $target 'stray-patch.js')) {throw 'Unmanaged source copied'}
  if(-not (Test-Path -LiteralPath (Join-Path $backup 'private-setting.json'))) {throw 'Old settings lost'}
  if((Get-Content -LiteralPath (Join-Path $runtime 'company-settings.json')) -ne 'company') {throw 'Runtime settings changed'}
  Set-Content -LiteralPath (Join-Path $target 'retired-patch.js') -Value 'old-patch'
  $sameBackup = Install-ManagedExtension $target $target
  if(Test-Path -LiteralPath (Join-Path $target 'retired-patch.js')) {throw 'Same-folder cleanup failed'}
  Set-Content -LiteralPath (Join-Path $source 'content.js') -Value 'corrupt'
  try { Install-ManagedExtension $source $target; throw 'Expected hash failure' } catch {if($_.Exception.Message -notmatch 'hash mismatch'){throw}}
  if((Get-Content -LiteralPath (Join-Path $target 'content.js')) -ne 'new-program') {throw 'Corrupt package replaced target'}
  Copy-Item -LiteralPath (Join-Path $target 'content.js') -Destination (Join-Path $source 'content.js') -Force
  function Move-Item { param($LiteralPath,$Destination)
    if($LiteralPath -like '*.stage-*'){throw 'simulated swap failure'}
    Microsoft.PowerShell.Management\\Move-Item -LiteralPath $LiteralPath -Destination $Destination
  }
  try { Install-ManagedExtension $source $target; throw 'Expected swap failure' } catch {if($_.Exception.Message -notmatch 'simulated swap failure'){throw}}
  if((Get-Content -LiteralPath (Join-Path $target 'content.js')) -ne 'new-program') {throw 'Rollback failed'}
  Remove-Item Function:\\Move-Item
  $bad = Get-Content -LiteralPath (Join-Path $source 'managed-files.json') -Raw | ConvertFrom-Json
  $bad.files | Add-Member NoteProperty '../escape.js' ('0'*64)
  $bad|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $source 'managed-files.json') -Encoding ASCII
  try { Install-ManagedExtension $source $target; throw 'Expected unsafe failure' } catch {if($_.Exception.Message -notmatch 'Unsafe inventory path'){throw}}
  Write-Output 'Safe replacement cases passed; no installed files or tasks changed.'
} finally {
  if(-not $sandbox.StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe test cleanup'}
  Microsoft.PowerShell.Management\\Remove-Item -LiteralPath $sandbox -Recurse -Force
}
`;
  const result = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
