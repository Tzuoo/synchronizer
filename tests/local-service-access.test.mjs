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
  const oversizedHeader = await request('/__sync/health', 'GET', { 'x-fill': 'x'.repeat(17000) }).then(value => value.status, error => error.code);
  assert.ok([400, 'ECONNRESET'].includes(oversizedHeader), 'oversized header must not be accepted');
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
  const beforeFailure=JSON.parse((await request('/__sync/bets')).data);
  assert.equal(beforeFailure.freshness,'fresh');
  assert.ok(beforeFailure.lastSuccessAt);
  const failedStatus=Buffer.from(JSON.stringify({refreshOk:false,errorCode:'REMOTE_FETCH_FAILED'})).toString('base64');
  assert.equal((await request('/__sync/cache','POST',{'x-sync-encoding':'base64'},failedStatus)).status,200);
  const afterFailure=JSON.parse((await request('/__sync/bets')).data);
  assert.deepEqual(afterFailure.bets,bets);
  assert.equal(afterFailure.lastSuccessAt,beforeFailure.lastSuccessAt);
  assert.equal(afterFailure.freshness,'stale');
  assert.equal(afterFailure.lastErrorCode,'REMOTE_FETCH_FAILED');
  assert.equal((await request('/__sync/cache','POST',{'x-sync-encoding':'base64'},encoded)).status,200);
  const recovered=JSON.parse((await request('/__sync/bets')).data);
  assert.equal(recovered.freshness,'fresh');
  assert.equal(recovered.lastErrorCode,null);
  assert.equal((await request('/__sync/cache', 'POST', {}, '{"bets":[]}')).status, 400);
  assert.equal((await request('/__sync/cache', 'POST', { origin: 'https://evil.test', 'x-sync-encoding': 'base64' }, encoded)).status, 400);
  assert.deepEqual(JSON.parse((await request('/__sync/bets')).data).bets, bets);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const rows = [{ id: 'test', date: today, playType: '正碼', totalAmount: 760 }];
  assert.equal((await request('/__sync/ledger-cache', 'POST', { 'x-sync-encoding': 'base64' }, Buffer.from(JSON.stringify({ rows })).toString('base64'))).status, 200);
  assert.deepEqual(JSON.parse((await request('/__sync/ledger', 'GET', { origin: `http://localhost:${port}` })).data).rows, rows);
  const mixed = [...rows, { id: 'old', date: '2020-01-01', totalAmount: 999 }];
  assert.equal((await request('/__sync/ledger-cache', 'POST', { 'x-sync-encoding': 'base64' }, Buffer.from(JSON.stringify({ rows: mixed })).toString('base64'))).status, 200);
  assert.deepEqual(JSON.parse((await request('/__sync/ledger')).data).rows, rows);
  const slow=net.createConnection({host:'127.0.0.1',port});
  await once(slow,'connect');
  slow.write(`GET /__sync/health HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Slow: `);
  const started=Date.now();
  try {
    assert.equal((await request('/__sync/health')).status,200);
    assert.ok(Date.now()-started<2500,'a stalled header must not block other loopback requests for 15 seconds');
  } finally { slow.destroy(); }
});
