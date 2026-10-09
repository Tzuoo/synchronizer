import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const base = new URL('../../RuntimeData/同步器擴充功能/src/content/', import.meta.url);
const sources = await Promise.all(['shared.js', 'parsers-dom.js', 'parsers-a06.js', 'parsers-umh.js'].map(name => readFile(new URL(name, base), 'utf8')));
const numbers = '01,02,03,04,06,07,08,09,10,11\n12,13,14,16,17,18,19,20,21,22\n23,24,26,27,28,29,30,31,32,33\n34,36,37,38,39';
function context(host) {
  const scope = { location: { hostname: `w1.${host}` }, document: { documentElement: { dataset: {} } }, chrome: { runtime: { getManifest: () => ({ version: 'test' }) }, storage: { local: { get: (_, cb) => cb({}), set() {} } } } };
  vm.runInNewContext(sources.join('\n'), scope);
  return scope;
}
function page(status = '(已刪單)', play = '三星', item = '3') {
  const batch = `${item} ${play}\n連柱碰\n2026-09-02\n18:12:15\n${status}\n${numbers}\n碰\n05,15,25,35 570 62.6 10 2380 23800 0 -243.95 8657.25 15142.75\n新增備註 單項金額總計 23800 0 -243.95 8657.25 15142.75`;
  return { body: { innerText: `【539】 第 C115213 期\n${batch}` }, querySelectorAll: selector => selector === 'td,th' ? [{ innerText: item, closest: () => ({ innerText: batch }) }] : [] };
}
function singleStarPage(rows, unit, item) {
  const detail = rows.map(selection => `${selection} 正常顯示 顯示去除 8000 49.5 ${unit} 1 ${unit} 0 0 0 ${unit}`).join('\n');
  const batch = `${item}\n四星\n單碰\n2026-10-09\n18:20:59\n${detail}\n新增備註 單項金額總計 ${rows.length * unit}`;
  return { body: { innerText: `【539】 第 C115245 期\n${batch}` }, querySelectorAll: selector => selector === 'td,th' ? [{ innerText: String(item), closest: () => ({ innerText: batch }) }] : [] };
}
const singleRows = ['01,04,13,36','04,06,09,35','04,10,20,39','06,13,34,39','09,10,13,21','09,12,23,33','10,12,28,35','10,32,34,36'];
for (const [host, rows, unit, item] of [['188hot.net',singleRows,120,3],['and539.com',singleRows.slice(1),200,4]]) {
  test(`${host} 實站四星單碰完整保留同批所有組及網站碰數`, () => {
    const scope=context(host),parse=host==='and539.com'?scope.scrapeUmhOrders:scope.scrape188Orders;
    const [bet]=parse(singleStarPage(rows,unit,item));
    assert.ok(bet,'不得漏掉單碰批次');
    assert.equal(bet.playType,'四星單碰');
    assert.equal(bet.itemNumber,String(item));
    assert.equal(bet.selection,rows.map(x=>x.replaceAll(',',', ')).join('\n'));
    assert.equal(bet.unitAmount,unit); assert.equal(bet.combinationCount,rows.length);
    assert.equal(bet.betAmount,rows.length*unit);
    assert.equal(parse(singleStarPage(rows,unit,item))[0].id,bet.id);
    const broken=singleStarPage(rows,unit,item);
    broken.body.innerText=broken.body.innerText.replace(`單項金額總計 ${rows.length*unit}`,`單項金額總計 ${rows.length*unit+1}`);
    assert.equal(parse(broken).length,0,'列金額與批次小計不一致不得宣告完整');
  });
}
test('海勝2 實站三星連碰換行24號與2024碰不截成最後4號', () => {
  const scope=context('and539.com');
  const selection='02,03,04,06,07,08,12,13,14,16\n17,18,22,23,24,26,27,28,32,33\n34,36,37,38';
  const batch=`8 三星\n連碰\n2026-10-09\n19:50:16\n${selection}\n顯示去除 570 62.6 25 2024 50600 0 0 0 50600\n新增備註 單項金額總計 50600`;
  const root={body:{innerText:`【539】 第 C115245 期\n${batch}`},querySelectorAll:()=>[]};
  const [bet]=scope.scrapeUmhOrders(root);
  assert.equal(bet.selection,selection.replace(/\n|,/g,', '));
  assert.equal(bet.combinationCount,2024); assert.equal(bet.unitAmount,25); assert.equal(bet.betAmount,50600);
});
for (const host of ['hyp98.com', '188hot.net', 'bnd139.com', 'umh693.com', 'and539.com']) {
  test(`${host} 連柱碰保留原名、完整兩組、原始碰數及刪單`, () => {
    const scope = context(host);
    const parse = ['umh693.com', 'and539.com'].includes(host) ? scope.scrapeUmhOrders : scope.scrape188Orders;
    const rows = parse(page());
    assert.equal(rows.length, 1);
    if (host === 'and539.com') assert.equal(rows[0].source, '海勝2');
    if (host === 'umh693.com') assert.equal(rows[0].source, '海勝');
    assert.equal(rows[0].playType, '三星連柱碰');
    assert.equal(rows[0].event, '539 / 三星連柱碰');
    assert.equal(rows[0].itemNumber, '3');
    assert.equal(rows[0].placedAt, '2026-09-02T18:12:15+08:00');
    assert.equal(rows[0].status, '已刪單');
    assert.equal(rows[0].unitAmount, 10);
    assert.equal(rows[0].combinationCount, 2380);
    assert.equal(rows[0].betAmount, 23800);
    assert.equal(rows[0].selection, numbers.replace(/\s*,\s*|\n/g, ', ') + '、碰 05, 15, 25, 35');
    assert.equal(parse(page())[0].id, rows[0].id, '重讀使用相同識別碼');
  });
}
test('連柱碰依網站星數及狀態，不把缺少金額欄位的內容猜成有效批次', () => {
  const scope = context('hyp98.com');
  assert.equal(scope.orderStatusFromText('台號 02　刪單　取消　新增備註'), '待結算');
  assert.equal(scope.orderStatusFromText('天碰二單碰\n刪單\n新增備註'), '待結算');
  assert.equal(scope.orderStatusFromText('特尾三單碰\n刪除\n新增備註'), '待結算');
  assert.equal(scope.orderStatusFromText('特碼單碰\n刪單\n新增備註'), '待結算');
  assert.equal(scope.orderStatusFromText('（已刪單）'), '已刪單');
  assert.equal(scope.orderStatusFromText('狀態：刪單'), '已刪單');
  assert.equal(scope.orderStatusFromText('狀態：已撤單'), '已取消');
  for (const play of ['二星', '四星']) {
    const row = scope.scrape188Orders(page('', play))[0];
    assert.equal(row.playType, `${play}連柱碰`);
    assert.equal(row.status, '待結算');
    assert.equal(row.combinationCount, 2380, '只讀取測試表格的值，不依星數重算');
  }
  const broken = page();
  broken.body.innerText = broken.body.innerText.replace('10 2380 23800', '10 未取得 23800');
  assert.equal(scope.scrape188Orders(broken).length, 0);
});
test('特殊包牌金額與碰數依表頭，找不到欄位不取整批金額', () => {
  const scope = context('kd998.net');
  const header = { children: ['玩法','內容','賠率','本金','每碰金額','碰數','下注金額'].map(textContent => ({ textContent })) };
  const row = { children: ['特殊包牌','兩組號碼','570','63','10','2380','23800'].map(textContent => ({ textContent })), closest: () => ({ querySelector: () => header }) };
  assert.equal(scope.betRowNumberByHeader(row, '每碰金額'), 10);
  assert.equal(scope.betRowNumberByHeader(row, '碰數'), 2380);
  assert.equal(scope.betRowNumberByHeader(row, '車數'), null);
});

test('喜下注明細只讀號碼文字，並辨認獨立的已撤單標籤', () => {
  const scope = context('kd998.net');
  const row = { querySelector: selector => selector === '.col-content' ? { textContent: 'visibility visibility球號03,23,25,36,37 點此查看下注內容' } : null };
  assert.equal(scope.kdBetContent(row), '03,23,25,36,37');
  const item = {
    innerText: '6\n二星連碰\n03,23,25,36,37\n已撤單',
    textContent: '6二星連碰03,23,25,36,37已撤單',
    querySelectorAll: () => [{ children: [], textContent: '已撤單' }],
  };
  assert.equal(scope.kdBetStatus(item), '已取消');
  assert.equal(scope.kdBetStatus({ ...item, querySelectorAll: () => [{ children: [], textContent: '刪單' }], innerText: '刪單' }), '待結算');
});

test('喜第 6 批 DOM 解析保留二星連碰與撤單，不收圖示字串', () => {
  const scope = context('kd998.net');
  const cell = value => ({ textContent: value });
  const rowCells = { '.col-play': '二星連碰', '.col-content': 'visibility visibility球號03,23,25,36,37 點此查看下注內容', '.col-money': '10000' };
  const header = { children: ['玩法', '內容', '賠率', '本金', '每碰金額', '碰數', '下注金額'].map(cell) };
  const row = { querySelector: selector => rowCells[selector] == null ? null : cell(rowCells[selector]), closest: () => ({ querySelector: () => header }), children: ['二星連碰', '03,23,25,36,37', '53', '71.8', '1000', '10', '10000'].map(cell), textContent: '二星連碰 03,23,25,36,37 10000' };
  const summary = { querySelector: selector => selector === '.col-money' ? cell('10000') : null };
  const itemCells = { '.bet_item_no': '6', '.bet_cnt > p.btm--gold': '2026-09-30', '.bet_time': '19:38:51' };
  const item = {
    querySelector: selector => selector === '.table .sumup_row' ? summary : itemCells[selector] == null ? null : cell(itemCells[selector]),
    querySelectorAll: selector => selector === '.table .tr:not(.bg--title--black):not(.sumup_row)' ? [row] : selector === '*' ? [{ children: [], textContent: '已撤單' }] : [],
    innerText: '6\n二星連碰\n已撤單', textContent: '6二星連碰已撤單',
  };
  const group = { id: 'F-test', querySelector: () => cell('539'), querySelectorAll: () => [item] };
  const root = { querySelector: () => ({ querySelectorAll: () => [group] }) };
  const bets = scope.scrapeKdOrders(root);
  assert.equal(bets.length, 1);
  assert.equal(bets[0].itemNumber, '6');
  assert.equal(bets[0].playType, '二星連碰');
  assert.equal(bets[0].status, '已取消');
  assert.equal(bets[0].betAmount, 10000);
  assert.equal(bets[0].combinationCount, 10);
  assert.match(bets[0].selection, /03,23,25,36,37/);
  assert.doesNotMatch(bets[0].selection, /visibility|點此查看下注內容/);
});

test('喜實站三星柱碰依表頭讀每碰50及384碰，不能因補欄位更換撤單舊ID', () => {
  const scope=context('kd998.net'),cell=textContent=>({textContent});
  const content='一柱:\n02,12,22\n二柱:\n07,17,27,37\n三柱:\n01,03,04\n38,39';
  const header={children:['玩法','內容','賠率','本金','每碰金額','碰數','下注金額','退水漲跌','退水金額','小計'].map(cell)};
  const values={'.col-play':'三星柱碰','.col-content':`visibility visibility_off ${content} 點此查看下注內容`,'.col-money':'19200','.col-total':'12259.20'};
  const row={querySelector:selector=>values[selector]==null?null:cell(values[selector]),closest:()=>({querySelector:()=>header}),children:['三星柱碰',content,'570','62.80','50','384','19200','-201.60','6940.80','12259.20'].map(cell),textContent:`三星柱碰 ${content}`};
  const summary={querySelector:selector=>selector==='.col-money'?cell('19200'):null};
  const itemValues={'.bet_item_no':'1 已撤單','.bet_cnt > p.btm--gold':'2026-10-03','.bet_time':'18:44:55'};
  const item={querySelector:selector=>selector==='.table .sumup_row'?summary:itemValues[selector]==null?null:cell(itemValues[selector]),querySelectorAll:selector=>selector==='*'?[{children:[],textContent:'已撤單'}]:[row],textContent:'1 已撤單'};
  const group={id:'G-test',querySelector:()=>cell('539 / F106986 - 002'),querySelectorAll:()=>[item]};
  const root={querySelector:()=>({querySelectorAll:()=>[group]})};
  const [bet]=scope.scrapeKdOrders(root);
  assert.equal(bet.unitAmount,50); assert.equal(bet.combinationCount,384); assert.equal(bet.betAmount,19200);
  assert.equal(bet.itemNumber,null,'撤單標籤不能順便改變來源識別規則；顯示項次由配對來源補足');
  assert.equal(bet.id,'w1.kd998.net|kd-batch|G-test|1 已撤單|2026-10-03|18:44:55');
  assert.equal(bet.selection,`三星柱碰｜${content}｜下注金額 19200`);
  assert.equal(scope.scrapeKdOrders(root)[0].id,bet.id);
  header.children=[];
  const [missing]=scope.scrapeKdOrders(root);
  assert.equal(missing.unitAmount,null); assert.equal(missing.combinationCount,null,'無表頭不能用金額與號碼反推碰數');
  assert.equal(missing.id,bet.id);
});
