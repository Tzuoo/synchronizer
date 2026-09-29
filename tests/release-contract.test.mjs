import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = resolve('../發布工具/Release-Selection.ps1');
const quote = path => `'${path.replaceAll("'", "''")}'`;
function cmd(command, args, dir) {
  const result = spawnSync(command, args, { cwd: dir, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test('M11 release contract 對 selection、工具及 HEAD/tree 的改變皆產生不同 fingerprint', { skip: process.platform !== 'win32' }, t => {
  const root = mkdtempSync(join(resolve('.'), '.sync-release-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const web = join(root, 'web'), backend = join(root, 'backend'), tool = join(root, 'tool');
  for (const repo of [web, backend]) {
    mkdirSync(repo); cmd('git', ['init', '-q'], repo); cmd('git', ['config', 'user.email', 'test@example.invalid'], repo);
    cmd('git', ['config', 'user.name', 'Test'], repo);
    writeFileSync(join(repo, 'tracked.txt'), 'first'); cmd('git', ['add', 'tracked.txt'], repo); cmd('git', ['commit', '-qm', 'first'], repo);
  }
  mkdirSync(tool);
  const tools = ['Publish-Synchronizer.ps1', 'Release-Selection.ps1', 'Build-ExtensionUpdate.ps1', 'Extension-Package.ps1', 'Register-ReleaseFiles.ps1'];
  for (const name of tools) writeFileSync(join(tool, name), `# ${name}`);
  const selection = join(tool, 'release-selection.json'); writeFileSync(selection, '{"web":["tracked.txt"]}');
  const fingerprint = () => cmd('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `. ${quote(helper)}; Get-ReleaseContractFingerprint ${quote(web)} ${quote(backend)} ${quote(tool)} ${quote(selection)}`], root);
  const baseline = fingerprint(); assert.match(baseline, /^[a-f0-9]{64}$/);
  writeFileSync(selection, '{"web":["tracked.txt"],"message":"changed"}');
  const selectionChanged = fingerprint(); assert.notEqual(selectionChanged, baseline);
  writeFileSync(join(tool, 'Publish-Synchronizer.ps1'), '# changed');
  const toolChanged = fingerprint(); assert.notEqual(toolChanged, selectionChanged);
  writeFileSync(join(web, 'tracked.txt'), 'second'); cmd('git', ['add', 'tracked.txt'], web); cmd('git', ['commit', '-qm', 'second'], web);
  assert.notEqual(fingerprint(), toolChanged);
});
