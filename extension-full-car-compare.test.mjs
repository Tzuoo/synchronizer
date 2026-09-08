import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../RuntimeData/同步器擴充功能/', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const source = await read('src/content/full-car.js');
const popup = await read('popup.js');
const background = await read('background.js');

test('全車加入清單模組不包含送出注單的操作選擇器', () => {
  assert.match(source, /=== '加入注單'/);
  assert.doesNotMatch(source, /=== '送出注單'/);
  assert.doesNotMatch(source, /includes\(['"]送出注單/);
  assert.doesNotMatch(source, /清單已有相同號碼/);
  assert.match(source, /page\.quotes\[order\.number\] !== order\.price/);
});

test('期數會從同源 frameset 的選單框架讀取', () => {
  assert.match(source, /collectSameOriginFrameText\(window\.top\)/);
  assert.match(source, /index < frame\.frames\.length/);
  assert.match(source, /\[A-Z\]\\d\{5,\}/);
});

test('比價操作必須先預檢，同價依筆數平均且不拆車數', () => {
  assert.match(popup, /FULL_CAR_PREFLIGHT/);
  assert.match(popup, /FULL_CAR_ADD_CART/);
  assert.ok(popup.indexOf('FULL_CAR_PREFLIGHT') < popup.lastIndexOf('FULL_CAR_ADD_CART'));
  assert.match(popup, /chooseBalancedSite/);
  assert.match(popup, /Math\.random/);
  assert.match(popup, /fullCarTieCounts/);
  assert.match(popup, /orders: \[\{ number: order\.number, cars: order\.cars, price: chosen\.price \}\]/);
  assert.match(popup, /Math\.min/);
});

test('重複號碼保留為獨立加入命令', () => {
  assert.doesNotMatch(popup, /同一號碼不可重複輸入/);
  assert.match(popup, /for \(const target of latestFullCarPlan\)/);
  assert.match(popup, /targets: \[target\]/);
});

test('背景只向實際登記的全車子框架傳送命令', () => {
  assert.match(background, /sender\.frameId/);
  assert.match(background, /chrome\.tabs\.sendMessage\(frame\.tabId/);
  assert.match(background, /\{ frameId: frame\.frameId \}/);
});

test('新增腳本可通過語法檢查', () => {
  new vm.Script(source);
  new vm.Script(popup);
  new vm.Script(background);
});
