import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../../RuntimeData/同步器擴充功能/', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const content = await read('content.js');
const manifest = JSON.parse(await read('manifest.json'));
const shared = await read('src/content/shared.js');
const ledger = await read('src/content/ledger.js');
const umhParser = await read('src/content/parsers-umh.js');

test('海勝2 在主頁與子框架注入兩個入口，並沿用海勝解析器', async () => {
  for (const entry of manifest.content_scripts.filter(item => item.matches.some(match => match.includes('and539.com')))) {
    assert.ok(entry.matches.includes('*://*.and539.com/*'));
    assert.equal(entry.all_frames, true);
  }
  assert.match(content, /\["umh693\.com", "and539\.com"\]\.includes\(domain\)\s*\? scrapeUmhOrders\(\)/);
  assert.match(await read('options.js'), /"w0\.and539\.com"/);
  assert.match(await read('background.js'), /"and539\.com":"0593"/);
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /"海勝","海勝2","航海"/);
  assert.match(await readFile(new URL('../remote-diagnostics.js', import.meta.url), 'utf8'), /'and539\.com':'海勝2'/);
});

test('兩站共用 A07 格式，保留獨立名稱、盤口、原始玩法及數值', () => {
  const sample = JSON.stringify(['539', '六合'].map(GameName => ({
    GameName, DataList: [{ PhaseName: 'test-phase', DataList: [
      { GroupName: '全車', TotBet: 1234, TotBetWinLose: 567 },
      { GroupName: '三星', TotBet: 890, TotBetWinLose: 0 }
    ] }]
  })));
  for (const [host, name] of [['w0.and539.com', '海勝2'], ['wc.umh693.com', '海勝']]) {
    const scope = {
      location: { hostname: host }, document: { documentElement: { dataset: {} } },
      chrome: { runtime: { getManifest: () => ({ version: 'test' }) } },
      window: { addEventListener() {} }, setInterval() {}
    };
    vm.runInNewContext(shared + '\n' + ledger.replace(/syncLedgerDom\(\);\s*$/, ''), scope);
    const rows = scope.parseA07LedgerResponse(sample, new Date('2026-09-03T12:00:00Z'));
    assert.deepEqual(Array.from(rows, r => [r.source, r.gameName, r.playType, r.totalAmount, r.winningAmount]), [
      [name, '539', '全車', 1234, 567], [name, '539', '三星', 890, 0],
      [name, '六合', '全車', 1234, 567], [name, '六合', '三星', 890, 0]
    ]);
    assert.equal(scope.parseA07LedgerResponse('not-json').length, 0);
  }
});

test('海勝2 大樂第一批台號單碰只有一個號碼時仍保留來源批次', () => {
  const scope = {
    location: { hostname: 'w2.and539.com' },
    document: { documentElement: { dataset: {} } },
    chrome: { runtime: { getManifest: () => ({ version: 'test' }) } },
    scrapeCommonPillarRows: () => [],
  };
  vm.runInNewContext(shared + '\n' + umhParser, scope);
  const batch = '1 台號\n單碰\n2026-09-25\n19:11:30\n09 25 76 1300 0 312 988\n新增備註';
  const page = {
    body: { innerText: `【大樂】 第 B115001 期\n${batch}\n單項金額總計 1300 0 312 988` },
    querySelectorAll: selector => selector === 'td,th'
      ? [{ innerText: '1', closest: () => ({ innerText: batch }) }]
      : [],
  };
  const rows = scope.scrapeUmhOrders(page);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, '海勝2');
  assert.equal(rows[0].event, '大樂 / 台號單碰');
  assert.equal(rows[0].playType, '台號單碰');
  assert.equal(rows[0].itemNumber, '1');
  assert.equal(rows[0].selection, '09');
  assert.equal(rows[0].betAmount, 1300);
  assert.equal(rows[0].placedAt, '2026-09-25T19:11:30+08:00');
  assert.equal(scope.scrapeUmhOrders(page)[0].id, rows[0].id, '重讀同批使用相同 ID');
  assert.equal(scope.scrapeUmhOrders({ ...page, body: { innerText: page.body.innerText.replace('09 25 76 1300', '09 25 76 1400') } }).length, 0,
    '明細金額和來源小計不一致時不可猜測補單');
  assert.equal(scope.scrapeUmhOrders({ ...page, body: { innerText: page.body.innerText.replace('【大樂】', '【539】') } }).length, 0,
    '不可將大樂的單號規則套到 539');
});
