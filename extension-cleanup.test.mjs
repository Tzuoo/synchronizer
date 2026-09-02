import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../RuntimeData/同步器擴充功能/', import.meta.url);
const source = await readFile(new URL('content.js', root), 'utf8');
function functions(names) {
  return names.map(name => {
    const match = source.match(new RegExp('^function ' + name + '\\([^]*?^}', 'm'));
    assert.ok(match, name);
    return match[0];
  }).join('\n');
}

function harness(host = 'w1.hyp98.com', path = '/current-session/Front/Shared/Index') {
  const frames = [];
  const links = [];
  const document = {
    documentElement: { dataset: {}, appendChild: frame => frames.push(frame) },
    createElement(tag) {
      assert.equal(tag, 'iframe');
      const attributes = {};
      return {
        attributes, dataset: {}, style: {}, loads: [],
        setAttribute(key, value) { attributes[key] = value; },
        getAttribute(key) { return attributes[key] ?? null; },
        set src(url) { this.loads.push(url); },
      };
    },
    querySelector(selector) {
      const attribute = selector.match(/^iframe\[([^\]]+)\]$/)?.[1];
      return frames.find(frame => attribute in frame.attributes) || null;
    },
    querySelectorAll() { return links; },
  };
  const window = { name: '' };
  window.top = window;
  window.parent = window;
  const context = vm.createContext({ document, window, location: new URL('https://' + host + path), URL, Date });
  vm.runInContext(functions([
    'rootDomain', 'findDetailsLink', 'findDetailsUrl', 'isInsideSyncDetailFrame',
    'openDetailsInsideBackgroundFrame', 'isInsideSyncLedgerFrame', 'directLedgerUrl',
    'directA06Url', 'ensureSyncFrame', 'ensureBackgroundLedger', 'refreshBackgroundLedger',
  ]), context);
  return { context, frames, links, window };
}

test('共用背景框架只建立一次，明細與總帳名稱和 URL 不互相覆蓋', () => {
  const { context: c, frames } = harness();
  c.ensureSyncFrame('details', 'https://example.test/A06');
  c.ensureSyncFrame('details', 'https://example.test/A06');
  c.ensureSyncFrame('ledger', 'https://example.test/A07');
  assert.equal(frames.length, 2);
  assert.deepEqual(frames.map(f => f.name), ['sync-detail-frame', 'sync-ledger-frame']);
  assert.deepEqual(frames.map(f => f.loads.length), [1, 1]);
  assert.equal(frames[0].attributes['data-sync-details'], '1');
  assert.equal(frames[1].attributes['data-sync-ledger'], '1');
  c.ensureSyncFrame('details', 'https://example.test/new/A06');
  assert.equal(frames[0].loads.length, 2);
  assert.equal(frames[1].loads.length, 1);
  assert.ok(frames.every(f => f.attributes['aria-hidden'] === 'true' && f.style.cssText.includes('pointer-events:none')));
});

test('A06/A07 路由白名單、動態登入前綴與總帳刷新保持原行為', () => {
  const a06 = ['hyp98.com', 'kd998.net', 'cj3688.com', '188hot.net', 'bnd139.com', 'umh693.com', 'amc283.com', 'pee688.com'];
  const a07 = ['hyp98.com', '188hot.net', 'bnd139.com', 'umh693.com', 'pee688.com'];
  for (const site of [...new Set([...a06, 'vs968.net', 'sk6688.net', 'unknown.test'])]) {
    const { context: c } = harness('w1.' + site);
    const prefix = 'https://w1.' + site + '/current-session/Front/A/';
    assert.equal(c.directA06Url(), a06.includes(site) ? prefix + 'A06' : '');
    assert.equal(c.directLedgerUrl(), a07.includes(site) ? prefix + 'A07' : '');
  }
  const { context: c, frames, window } = harness();
  c.ensureBackgroundLedger();
  c.ensureBackgroundLedger();
  assert.equal(frames.length, 1);
  assert.equal(frames[0].loads.length, 1);
  c.refreshBackgroundLedger();
  assert.match(frames[0].loads[1], /\/current-session\/Front\/A\/A07\?_sync=\d+$/);
  window.top = {};
  c.ensureBackgroundLedger();
  assert.equal(frames.length, 1);
  assert.equal(harness('w1.hyp98.com', '/login').context.directLedgerUrl(), '');
});

test('明細搜尋沿用第一個符合文字的連結，只有背景框可點擊', () => {
  const { context: c, links, window } = harness();
  assert.equal(c.findDetailsUrl(), c.location.href);
  let clicks = 0;
  links.push({ textContent: '總帳' }, { textContent: '下 注 明 細', getAttribute: () => '/details', click: () => clicks++ });
  assert.equal(c.findDetailsUrl(), 'https://w1.hyp98.com/details');
  c.openDetailsInsideBackgroundFrame();
  assert.equal(clicks, 0);
  window.name = 'sync-detail-frame';
  c.openDetailsInsideBackgroundFrame();
  assert.equal(clicks, 1);
  links[1].getAttribute = () => 'javascript:void(0)';
  c.location = new URL('https://www.vs968.net/new_web/index.php?session=current');
  assert.equal(c.findDetailsUrl(), 'https://www.vs968.net/new_web/index.php?session=current#/main/main06');
});

test('移除未使用入口但保留仍被呼叫的分組解析與資料保護', async () => {
  assert.doesNotMatch(source, /function (?:scrapeGroupedReport|isLoggedInWorkPage)\(/);
  assert.match(source, /scrapeGroupedReportFrom\(doc\)/);
  assert.equal((source.match(/document\.createElement\("iframe"\)/g) || []).length, 1);
  const background = await readFile(new URL('background.js', root), 'utf8');
  assert.doesNotMatch(background, /delete detectedAccounts\["kd998.net"\]/);
  assert.match(background, /key === "kd998.net" \|\| key.endsWith\(".kd998.net"\)/);
  assert.match(background, /legacy\?\.uploadAt/);
});
