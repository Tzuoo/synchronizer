import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import http from 'node:http';

test('隔離本機服務：中文快取、擴充預檢、来源限制與同前綴目錄越界', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'synchronizer-access-test-'));
  const web = path.join(directory, 'web'), sibling = path.join(directory, 'web-old');
  await mkdir(web); await mkdir(sibling);
  await writeFile(path.join(web, 'index.html'), 'test page');
  await writeFile(path.join(sibling, 'outside.txt'), 'must not read');
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const scriptPath = fileURLToPath(new URL('../../本機同步器/Local-SynchronizerServer.ps1', import.meta.url));
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const command = `& ${quote(scriptPath)} -Port ${port} -WebRoot ${quote(web)} -DataDirectory ${quote(path.join(directory, 'cache'))}`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = ''; child.stderr.on('data', value => errors += value);
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    assert.ok(directory.startsWith(path.join(tmpdir(), 'synchronizer-access-test-')));
    await rm(directory, { recursive: true, force: true });
  });
  const request = (route, method = 'GET', headers = {}, body = '') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers: { ...headers, ...(body ? { 'content-length': Buffer.byteLength(body) } : {}) } }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', value => data += value);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject); req.end(body);
  });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { ready = (await request('/__sync/health')).status === 200; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, errors);
  assert.equal((await request('/')).data, 'test page');
  assert.equal((await request('/..%2fweb-old/outside.txt')).status, 404);
  assert.equal((await request('/', 'GET', { host: `evil.test:${port}` })).status, 400);
  assert.equal((await request('/__sync/bets', 'GET', { origin: 'https://evil.test' })).status, 400);
  assert.equal((await request('/__sync/bets', 'GET', { origin: 'null' })).status, 400);
  const extension = `chrome-extension://${'a'.repeat(32)}`;
  const preflight = await request('/__sync/cache', 'OPTIONS', { origin: extension, 'sec-fetch-site': 'cross-site', 'access-control-request-headers': 'x-sync-encoding,content-type' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], extension);
  assert.match(preflight.headers['access-control-allow-headers'], /x-sync-encoding/);
  const bets = [{ id: 'test', playType: '台號', selection: '02', stake: 400 }];
  const encoded = Buffer.from(JSON.stringify({ bets })).toString('base64');
  assert.equal((await request('/__sync/cache', 'POST', { origin: extension, 'sec-fetch-site': 'cross-site', 'x-sync-encoding': 'base64' }, encoded)).status, 200);
  assert.deepEqual(JSON.parse((await request('/__sync/bets')).data).bets, bets);
  assert.equal((await request('/__sync/cache', 'POST', {}, '{"bets":[]}')).status, 400);
  assert.equal((await request('/__sync/cache', 'POST', { origin: 'https://evil.test', 'x-sync-encoding': 'base64' }, encoded)).status, 400);
  assert.deepEqual(JSON.parse((await request('/__sync/bets')).data).bets, bets);
  const rows = [{ id: 'test', playType: '正碼', totalAmount: 760 }];
  assert.equal((await request('/__sync/ledger-cache', 'POST', { 'x-sync-encoding': 'base64' }, Buffer.from(JSON.stringify({ rows })).toString('base64'))).status, 200);
  assert.deepEqual(JSON.parse((await request('/__sync/ledger', 'GET', { origin: `http://localhost:${port}` })).data).rows, rows);
});
