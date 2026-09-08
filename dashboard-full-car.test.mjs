import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const ui = await readFile(new URL('./full-car-dashboard.js', import.meta.url), 'utf8');
const bridge = await readFile(new URL('../RuntimeData/同步器擴充功能/dashboard-bridge.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../RuntimeData/同步器擴充功能/manifest.json', import.meta.url), 'utf8'));

test('同步器網頁提供獨立比價頁與熟悉的快速選號工具', () => {
  assert.match(html, /id="compareTab"[^>]*>比價下單/);
  for (const id of ['fullCarNumber','fullCarCars','fullCarQuickButtons','fullCarTens','fullCarUnits','fullCarSums','fullCarAddCars','fullCarApplyCars']) assert.match(html, new RegExp(`id="${id}"`));
  for (const label of ['紅波','藍波','綠波','單','雙','大','小','全','總和單','總和雙','總和大','總和小']) assert.ok(ui.includes(`'${label}'`));
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
  assert.match(ui, /state\.orders\.push\(\{ number, cars \}\)/);
  assert.doesNotMatch(ui, /new Set\(state\.orders\.map/);
  assert.match(ui, /PLAN_FULL_CAR/);
  assert.match(ui, /FULL_CAR_ADD_SEQUENCE/);
});
