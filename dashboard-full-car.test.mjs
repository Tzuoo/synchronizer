import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('./full-car-dashboard.js', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../RuntimeData/同步器擴充功能/dashboard-bridge.js', import.meta.url), 'utf8');
const pageHook = await readFile(new URL('../RuntimeData/同步器擴充功能/page-hook.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../RuntimeData/同步器擴充功能/manifest.json', import.meta.url), 'utf8'));

test('同步器網頁提供獨立比價頁與熟悉的快速選號工具', () => {
  assert.match(html, /id="compareTab"[^>]*>比價下單/);
  for (const id of ['fullCarNumber','fullCarCars','fullCarWaves','fullCarQuickButtons','fullCarTens','fullCarUnits','fullCarSums','fullCarAddCars','fullCarApplyCars']) assert.match(html, new RegExp(`id="${id}"`));
  for (const label of ['紅波','藍波','綠波','單','雙','大','小','全','總和單','總和雙','總和大','總和小']) assert.ok(ui.includes(`'${label}'`));
  assert.match(html, /id="fullCarWaves"[^>]*><\/div><div id="fullCarQuickButtons"/);
  assert.match(ui, /<option>天天樂<\/option>/);
  assert.match(ui, /state\.game==='天天樂'\?\['全車'\]/);
});

test('快速下注鍵盤、單選切換及成功後清除行為跟網站一致', () => {
  assert.match(ui, /length===2[^\n]+fullCarCars[^\n]+focus/);
  assert.match(ui, /fullCarCars[^\n]+keydown[^\n]+submit/);
  assert.match(ui, /state\.activeQuickKey===key\?'':key/);
  assert.match(ui, /state\.selected\.clear\(\)/);
  assert.match(ui, /總和大[^\n]+>6/);
  assert.match(ui, /總和小[^\n]+<=6/);
  assert.match(ui, /state\.orders=\[\];resetSelection\(\);resetEntry\(\);state\.plan=null/);
  assert.match(html, /<script src="full-car-dashboard\.js\?build=80"><\/script>/);
});

test('網頁橋接只接受正式網址與本機測試來源，且不存在送出注單命令', () => {
  const entry = manifest.content_scripts.find(item => item.js.includes('dashboard-bridge.js'));
  assert.deepEqual(entry.matches, ['https://tzuoo.github.io/synchronizer/*','http://127.0.0.1/*','http://localhost/*']);
  assert.match(bridge, /isSynchronizerOrigin\(event\.origin\)/);
  assert.match(bridge, /url\.protocol === 'http:'[^\n]+\['localhost', '127\.0\.0\.1'\]/);
  assert.match(bridge, /PLAN_FULL_CAR/);
  assert.match(bridge, /game: request\.game, playType: request\.playType/);
  assert.match(bridge, /FULL_CAR_ADD_SEQUENCE/);
  assert.doesNotMatch(bridge + ui, /送出注單['"]?\s*\)/);
  assert.match(html, /不會送出注單/);
});

test('只有 localhost 與 127.0.0.1 本機預覽免密碼，正式網址仍需驗證', () => {
  assert.match(html, /IS_LOCAL_PREVIEW=\['localhost','127\.0\.0\.1'\]\.includes\(location\.hostname\)/);
  assert.match(html, /if\(IS_LOCAL_PREVIEW\|\|authToken\)lock\.classList\.add\('hidden'\)/);
  assert.doesNotMatch(html, /preview=1[^\n]+lock\.classList/);
  assert.match(html, /fetch\(`\$\{API_ROOT\}\/auth`/);
});

test('重複號碼保留、同價分配由擴充共用平衡紀錄決定', () => {
  assert.match(ui, /state\.orders\.push\(\{number,value\}\)/);
  assert.doesNotMatch(ui, /new Set\(state\.orders\.map/);
  assert.match(ui, /PLAN_FULL_CAR/);
  assert.match(ui, /FULL_CAR_ADD_SEQUENCE/);
});

test('加州彩可切換全車與台號，台號採金額並使用共同比價規劃', () => {
  assert.match(ui, /<option>加州彩<\/option>/);
  assert.match(ui, /\['全車','台號'\]/);
  assert.match(ui, /Play04Numbers|GET_QUOTE_REPORTS/);
  assert.match(ui, /台號'.+min:0,max:99,unit:'金額'/);
  assert.match(ui, /PLAN_FULL_CAR/);
  assert.match(ui, /state\.playType==='台號'.+min:0,max:99,unit:'金額'/);
  assert.match(ui, /function planCanAdd\(\)/);
  assert.match(ui, /if\(!planCanAdd\(\)\)return/);
});

test('風雲 539 與加州彩都背景回報全車及台號本金', () => {
  assert.match(pageHook, /sourceName\.includes\('539'\).*\/加州\|California\/i/);
  assert.match(pageHook, /Play01Numbers/);
  assert.match(pageHook, /Play04Numbers/);
  assert.match(pageHook, /price = Number\(row\?\.capital\)/);
  assert.match(pageHook, /Object\.keys\(fullCarQuotes\)\.length === 39/);
  assert.match(pageHook, /Object\.keys\(taihaoQuotes\)\.length === 100/);
  assert.match(pageHook, /SYNC_WIND_CART_COMMAND/);
  assert.match(pageHook, /syncQuoteState = 'waiting-store'/);
  assert.match(pageHook, /syncQuoteState = `posted-\$\{posted\.join/);
  assert.match(pageHook, /visiblePhase = pageText\.match\(\/\\b\(\[A-Z\]\\d\{5,\}/);
  assert.match(pageHook, /visibleGame = pageText\.match/);
  assert.match(pageHook, /windQuoteContext\(store\)/);
  assert.match(pageHook, /component\.\$refs\.info\.addBet/);
  assert.doesNotMatch(pageHook, /\.doBet\(/);
});

test('比價畫面不顯示期數且期數不參與下單橋接', () => {
  assert.doesNotMatch(ui, /display\.textContent=`期數/);
  assert.doesNotMatch(ui, /已連線・\$\{report\.phase\}/);
  assert.doesNotMatch(ui, /phase:report\.phase/);
});

test('加州彩全車與台號可建立風雲暫存方案', () => {
  assert.match(ui, /requestExtension\('PLAN_FULL_CAR'/);
  assert.doesNotMatch(ui, /state\.game!=='539'/);
  assert.doesNotMatch(ui, /只預覽/);
});

test('天天樂目前僅測試背景報價，不可加入網站清單', () => {
  assert.match(ui, /const isReadOnly=\(\)=>state\.game==='天天樂'/);
  assert.match(ui, /天天樂目前只測試背景報價，不加入清單/);
  assert.match(ui, /!isReadOnly\(\)/);
  assert.match(ui, /if\(!planCanAdd\(\)\)return/);
});
