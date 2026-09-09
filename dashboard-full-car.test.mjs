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
});

test('快速下注鍵盤、單選切換及成功後清除行為跟網站一致', () => {
  assert.match(ui, /length===2[^\n]+fullCarCars[^\n]+focus/);
  assert.match(ui, /fullCarCars[^\n]+keydown[^\n]+submit/);
  assert.match(ui, /state\.activeQuickKey===key\?'':key/);
  assert.match(ui, /state\.selected\.clear\(\)/);
  assert.match(ui, /總和大[^\n]+>6/);
  assert.match(ui, /總和小[^\n]+<=6/);
  assert.match(ui, /state\.orders=\[\];resetSelection\(\);resetEntry\(\);state\.plan=null/);
  assert.match(html, /<script src="full-car-dashboard\.js\?build=74"><\/script>/);
});

test('網頁橋接限正式網址與加入清單命令，不存在送出注單命令', () => {
  const entry = manifest.content_scripts.find(item => item.js.includes('dashboard-bridge.js'));
  assert.deepEqual(entry.matches, ['https://tzuoo.github.io/synchronizer/*']);
  assert.match(bridge, /event\.origin !== SYNCHRONIZER_ORIGIN/);
  assert.match(bridge, /PLAN_FULL_CAR/);
  assert.match(bridge, /FULL_CAR_ADD_SEQUENCE/);
  assert.doesNotMatch(bridge + ui, /送出注單['"]?\s*\)/);
  assert.match(html, /不會送出注單/);
});

test('重複號碼保留、同價分配由擴充共用平衡紀錄決定', () => {
  assert.match(ui, /state\.orders\.push\(\{number,value\}\)/);
  assert.doesNotMatch(ui, /new Set\(state\.orders\.map/);
  assert.match(ui, /PLAN_FULL_CAR/);
  assert.match(ui, /FULL_CAR_ADD_SEQUENCE/);
});

test('加州彩可切換全車與台號，台號採金額且只開放背景報價預覽', () => {
  assert.match(ui, /<option>加州彩<\/option>/);
  assert.match(ui, /\['全車','台號'\]/);
  assert.match(ui, /Play04Numbers|GET_QUOTE_REPORTS/);
  assert.match(ui, /台號'.+min:0,max:99,unit:'金額'/);
  assert.match(ui, /背景報價已完成.*加入暫存清單尚未啟用/);
  assert.match(ui, /!Array\.isArray\(state\.plan\)\|\|state\.game!=='539'\|\|state\.playType!=='全車'/);
});

test('風雲 539 與加州彩都背景回報全車及台號本金', () => {
  assert.match(pageHook, /\['539', '加州彩'\]\.includes\(gameName\)/);
  assert.match(pageHook, /Play01Numbers/);
  assert.match(pageHook, /Play04Numbers/);
  assert.match(pageHook, /price = Number\(row\?\.capital\)/);
  assert.match(pageHook, /Object\.keys\(fullCarQuotes\)\.length === 39/);
  assert.match(pageHook, /Object\.keys\(taihaoQuotes\)\.length === 100/);
});
