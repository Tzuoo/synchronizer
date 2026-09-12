import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const installer = fileURLToPath(new URL('../../RuntimeData/Updater/Install-UpdateTask.ps1', import.meta.url));
const source = await readFile(installer, 'utf8');

test('updater and installer remain ASCII-safe and parse in real Windows PowerShell 5.1', {skip: process.platform !== 'win32'}, async () => {
  const updater = fileURLToPath(new URL('../../RuntimeData/Updater/Update-Synchronizer.ps1', import.meta.url));
  for (const path of [installer, updater]) {
    assert.doesNotMatch(await readFile(path, 'utf8'), /[^\x00-\x7f]/);
    const script = `$ErrorActionPreference='Stop'; if($PSVersionTable.PSVersion.Major -ne 5){throw 'Expected Windows PowerShell 5.1'}; $t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile('${path.replaceAll("'", "''")}',[ref]$t,[ref]$e)|Out-Null; if($e.Count){throw ($e|Out-String)}; Write-Output 'Parse passed'`;
    const result = spawnSync(`${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {encoding:'utf8', windowsHide:true, timeout:30000});
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.ok(source.indexOf('Parser]::ParseFile') < source.indexOf('$task = Register-SynchronizerUpdateTask'));
});

test('installer elevates only once for the existing protected RuntimeData folder, then schedules least-privilege updates', () => {
  assert.doesNotMatch(source, /schtasks\.exe/);
  assert.match(source, /Start-Process[\s\S]*-Verb RunAs/);
  assert.match(source, /Grant-UserRuntimeModify/);
  assert.match(source, /InstallUserSid/);
  assert.match(source, /InstallAccount/);
  assert.match(source, /icacls\.exe/);
  assert.match(source, /-WindowStyle Hidden/);
  assert.match(source, /Principal\.RunLevel = 0/);
  assert.match(source, /Principal\.LogonType = 3/);
  assert.match(source, /install\.log/);
  assert.match(source, /Exception\.ToString\(\)/);
  assert.match(source, /Get-CurrentChromeSynchronizerPath/);
  assert.match(source, /Chrome still loads a different extension folder/);
  assert.match(source, /never edit Preferences/);
  assert.match(source, /function Install-ExtensionSafely/);
  assert.match(source, /Install-ManagedExtension/);
  assert.match(source, /Previous extension backup/);
  assert.ok(source.indexOf('Install-ExtensionSafely $sourceExtensionDir.FullName $targetExtensionDir') > source.indexOf('$sourceExtensionDir ='));
  assert.ok(source.indexOf('$task = Register-SynchronizerUpdateTask') < source.indexOf('Remove-ItemProperty'));
  assert.ok(source.indexOf('Registered task verification failed') < source.indexOf('Remove-ItemProperty'));
});

test('Windows task definition keeps paths intact and detects registration failures without installing', {skip: process.platform !== 'win32'}, () => {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
. '${installer.replaceAll("'", "''")}'
# NewTask creates only an in-memory definition. Registration is a fake object.
$real = New-Object -ComObject 'Schedule.Service'
$real.Connect()
$folder = [pscustomobject]@{ Saved = $null; Fail = $false; Corrupt = $false; Calls = 0 }
$folder | Add-Member ScriptMethod RegisterTaskDefinition {
  param($name,$definition,$flags,$sid,$password,$logon,$sddl)
  if ($this.Fail) { throw 'simulated registration failure' }
  if ($name -ne 'SynchronizerBackgroundUpdate' -or $flags -ne 6 -or $logon -ne 3 -or $null -ne $password) { throw 'Wrong registration options' }
  $this.Calls++
  $this.Saved = [pscustomobject]@{ Enabled = (-not $this.Corrupt); Definition = $definition }
  return $this.Saved
}
$folder | Add-Member ScriptMethod GetTask { param($name) return $this.Saved }
$service = [pscustomobject]@{ Real = $real; Folder = $folder }
$service | Add-Member ScriptMethod NewTask { param($flags) return $this.Real.NewTask($flags) }
$service | Add-Member ScriptMethod GetFolder { param($path) return $this.Folder }
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$exe = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$path = 'C:\test folder\公司 & 家裡\Updater\Update-Synchronizer.ps1'
$task = Register-SynchronizerUpdateTask $service $exe $path $sid
$action = $task.Definition.Actions.Item(1)
if ($action.Path -ne $exe -or -not $action.Arguments.EndsWith('-File "' + $path + '"')) { throw 'Path quoting lost' }
if ($task.Definition.Triggers.Count -ne 1) { throw 'Extra triggers' }
$trigger = $task.Definition.Triggers.Item(1)
$triggerSid = (New-Object System.Security.Principal.NTAccount($trigger.UserId)).Translate([System.Security.Principal.SecurityIdentifier]).Value
if ($trigger.Type -ne 9 -or $triggerSid -ne $sid -or -not $trigger.Enabled) { throw 'Wrong logon trigger' }
if ($trigger.Repetition.Interval) { throw 'Repeating updates allowed' }
if ($task.Definition.Settings.MultipleInstances -ne 2) { throw 'Overlapping updates allowed' }
if (-not $task.Definition.Settings.Hidden) { throw 'Not hidden' }
[xml]$xml = $task.Definition.XmlText
if (-not $xml.Task.Actions.Exec.Command) { throw 'Invalid task XML' }
$folder.Fail = $true
try { Register-SynchronizerUpdateTask $service $exe $path $sid; throw 'Expected failure missing' }
catch { if ($_.Exception.Message -notmatch 'simulated registration failure') { throw } }
$folder.Fail = $false
$folder.Corrupt = $true
try { Register-SynchronizerUpdateTask $service $exe $path $sid; throw 'Expected verification failure missing' }
catch { if ($_.Exception.Message -notmatch 'verification failed') { throw } }
Write-Output 'In-memory task definition and simulated failures passed; no task registered.'
`;
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {encoding:'utf8', windowsHide:true, timeout:30000});
  assert.equal(result.status, 0, result.stdout + result.stderr + String(result.error || ''));
});
