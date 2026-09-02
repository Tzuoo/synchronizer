import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { extensionRoot, contentParts, composeContent, buildContent } from './tools/build-extension.mjs';

test('content.js is exactly the generated source and compiles as a single script', async () => {
  const result = await buildContent({ check: true });
  assert.doesNotThrow(() => new vm.Script(result));
  assert.equal(await composeContent(), result);
});

test('every content source is included once, in its original dependency order', async () => {
  const files = (await readdir(new URL('src/content/', extensionRoot))).filter(name => name.endsWith('.js'));
  assert.deepEqual([...contentParts].sort(), files.sort());
  assert.equal(new Set(contentParts).size, contentParts.length);
  const source = await composeContent();
  assert.ok(source.indexOf('function scrape(') < source.indexOf('function scrapeUmhOrders('));
  assert.ok(source.indexOf('syncLedgerDom();') < source.indexOf('const kdCarUnits ='));
  assert.ok(source.indexOf('const kdCarUnits =') < source.indexOf('pollLearnedDetail();'));
  assert.ok(source.indexOf('function findDetailsLink(') > source.indexOf('heartbeat();'));
});

test('Chrome still loads the single content entry, not separate scripts with changed hoisting', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', extensionRoot), 'utf8'));
  const entry = manifest.content_scripts.find(item => item.js.includes('content.js'));
  assert.deepEqual(entry.js, ['content.js']);
  assert.equal(entry.run_at, 'document_idle');
  assert.equal(entry.all_frames, true);
});

test('check mode detects stale runtime without overwriting it; missing source fails closed', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'synchronizer-build-test-'));
  const root = pathToFileURL(directory + path.sep);
  try {
    await mkdir(new URL('src/content/', root), { recursive: true });
    for (const name of contentParts) await writeFile(new URL(`src/content/${name}`, root), '// fixture\n');
    await buildContent({ root });
    await writeFile(new URL('content.js', root), '// stale');
    await assert.rejects(buildContent({ root, check: true }), /stale/);
    assert.equal(await readFile(new URL('content.js', root), 'utf8'), '// stale');
    await rm(new URL(`src/content/${contentParts[0]}`, root));
    await assert.rejects(composeContent(root), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
