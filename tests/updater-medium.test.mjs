import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const source = resolve('../RuntimeData/Updater');

function fixture(corrupt = false) {
  const root = mkdtempSync(join(tmpdir(), 'sync-medium-updater-'));
  const runtime = join(root, 'RuntimeData');
  const extension = join(runtime, 'extension');
  const updater = join(runtime, 'Updater');
  mkdirSync(extension, { recursive: true }); mkdirSync(updater);
  for (const name of ['Update-Synchronizer.ps1', 'Safe-ExtensionFiles.ps1']) copyFileSync(join(source, name), join(updater, name));
  const files = {};
  for (const [name, content] of Object.entries({ 'manifest.json': '{"version":"1.0.0"}', 'background.js': '// good' })) {
    writeFileSync(join(extension, name), corrupt && name === 'background.js' ? '// damaged' : content);
    files[name] = createHash('sha256').update(content).digest('hex');
  }
  writeFileSync(join(extension, 'managed-files.json'), JSON.stringify({ schemaVersion: 1, files }));
  return { root, updater, extension };
}

async function invoke(fixture, url, extra = []) {
  try {
    const result = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(fixture.updater, 'Update-Synchronizer.ps1'), '-VersionUrl', url, ...extra], { env: { ...process.env, LOCALAPPDATA: fixture.root }, windowsHide: true, timeout: 12000 });
    return { code: 0, ...result };
  } catch (error) { return { code: error.code, signal: error.signal, stderr: error.stderr }; }
}

test('M09 版本相同但 managed file 損壞不得回報 current', { skip: process.platform !== 'win32' }, async t => {
  const f = fixture(true); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const server = createServer((_req, res) => res.end(JSON.stringify({ version: '1.0.0', url: 'http://127.0.0.1/unused', sha256: '0'.repeat(64) })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const result = await invoke(f, `http://127.0.0.1:${server.address().port}/version`);
  const status = JSON.parse(readFileSync(join(f.root, 'SynchronizerUpdater/status.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(result.code, 1);
  assert.equal(status.state, 'failed');
  assert.match(status.message, /verification/i);
});

test('M09 版本相同且檔案完整才回報 current', { skip: process.platform !== 'win32' }, async t => {
  const f = fixture(); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const server = createServer((_req, res) => res.end(JSON.stringify({ version: '1.0.0', url: 'http://127.0.0.1/unused', sha256: '0'.repeat(64) })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const result = await invoke(f, `http://127.0.0.1:${server.address().port}/version`);
  assert.equal(result.code, 0, JSON.stringify(result));
  const status = JSON.parse(readFileSync(join(f.root, 'SynchronizerUpdater/status.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(status.state, 'current');
});

test('M09 永不完成的版本下載須在指定 deadline 內失敗並釋放鎖', { skip: process.platform !== 'win32' }, async t => {
  const f = fixture(); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const server = createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.closeAllConnections?.()); t.after(() => server.close());
  const result = await invoke(f, `http://127.0.0.1:${server.address().port}/version`, ['-DownloadTimeoutSeconds', '1']);
  assert.equal(result.code, 1, JSON.stringify(result));
  const status = JSON.parse(readFileSync(join(f.root, 'SynchronizerUpdater/status.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(status.state, 'failed');
  const recovery = await invoke(f, 'http://127.0.0.1:1/unreachable', ['-DownloadTimeoutSeconds', '1']);
  assert.equal(recovery.code, 1);
  assert.notEqual(recovery.signal, 'SIGTERM');
});

test('M09 永不完成的套件下載須失敗且不破壞已安裝檔案', { skip: process.platform !== 'win32' }, async t => {
  const f = fixture(); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const server = createServer((req, res) => {
    if (req.url.startsWith('/version')) res.end(JSON.stringify({ version: '2.0.0', url: `http://127.0.0.1:${server.address().port}/zip`, sha256: '0'.repeat(64) }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.closeAllConnections?.()); t.after(() => server.close());
  const result = await invoke(f, `http://127.0.0.1:${server.address().port}/version`, ['-DownloadTimeoutSeconds', '1']);
  assert.equal(result.code, 1, JSON.stringify(result));
  assert.equal(readFileSync(join(f.extension, 'background.js'), 'utf8'), '// good');
  const status = JSON.parse(readFileSync(join(f.root, 'SynchronizerUpdater/status.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(status.state, 'failed');
});

test('M10 兩次更新共用目標時，各自 runId 結果仍保留', { skip: process.platform !== 'win32' }, async t => {
  const f = fixture(); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const server = createServer((_req, res) => res.end(JSON.stringify({ version: '1.0.0', url: 'http://127.0.0.1/unused', sha256: '0'.repeat(64) })));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const ids = ['aaaaaaaa-aaaaaaaa', 'bbbbbbbb-bbbbbbbb'];
  const results = await Promise.all(ids.map(id => invoke(f, `http://127.0.0.1:${server.address().port}/version`, ['-RunId', id])));
  assert.deepEqual(results.map(result => result.code), [0, 0]);
  for (const id of ids) {
    const status = JSON.parse(readFileSync(join(f.root, 'SynchronizerUpdater', `${id}.status.json`), 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(status.runId, id);
    assert.equal(status.state, 'current');
  }
});
