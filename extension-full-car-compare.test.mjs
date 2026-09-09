import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const root = new URL('../RuntimeData/同步器擴充功能/', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const source = await read('src/content/full-car.js');
const popup = await read('popup.js');
const popupHtml = await read('popup.html');
const bridge = await read('dashboard-bridge.js');
const background = await read('background.js');
const pageHook = await read('page-hook.js');

test('全車加入清單模組不包含送出注單的操作選擇器', () => {
  assert.match(source, /=== '加入注單'/);
  assert.doesNotMatch(source, /=== '送出注單'/);
  assert.doesNotMatch(source, /includes\(['"]送出注單/);
  assert.doesNotMatch(source, /清單已有相同號碼/);
  assert.match(source, /page\.quotes\[order\.number\] !== order\.price/);
});

test('期數只保留為診斷資訊，不阻擋三站比價或加入清單', () => {
  assert.match(source, /collectSameOriginFrameText\(window\.top\)/);
  assert.match(source, /index < frame\.frames\.length/);
  assert.match(source, /\[A-Z\]\\d\{5,\}/);
  assert.doesNotMatch(source, /page\.phase\s*!==\s*message\.phase/);
  assert.doesNotMatch(background, /網站期數不同|期數不同或尚未辨識/);
  assert.doesNotMatch(pageHook, /phase\s*!==\s*request\.phase/);
  assert.doesNotMatch(bridge, /phase\s*:/);
});

test('比價操作由同步器網頁橋接，彈窗不再保留重複介面', () => {
  assert.match(bridge, /PLAN_FULL_CAR/);
  assert.match(bridge, /FULL_CAR_ADD_SEQUENCE/);
  assert.match(background, /FULL_CAR_PREFLIGHT/);
  assert.match(background, /FULL_CAR_ADD_CART/);
  assert.match(background, /fullCarTieCounts/);
  assert.doesNotMatch(popupHtml, /full-car|比價|加入最低價清單/);
  assert.doesNotMatch(popup, /FULL_CAR|fullCar|latestFullCarPlan/);
});

test('背景仍保留網頁所需的逐筆加入命令', () => {
  assert.match(background, /FULL_CAR_ADD_SEQUENCE/);
  assert.match(background, /for \(const target of message\.targets/);
  assert.match(background, /目前沒有已開啟且可取得 539 全車報價的網站/);
  assert.doesNotMatch(background, /reports\.length !== 2/);
  assert.match(background, /QUOTE_PREFLIGHT/);
  assert.match(background, /QUOTE_ADD_CART/);
});

test('背景只向實際登記的全車子框架傳送命令', () => {
  assert.match(background, /sender\.frameId/);
  assert.match(background, /chrome\.tabs\.sendMessage\(frame\.tabId/);
  assert.match(background, /\{ frameId: frame\.frameId \}/);
});

test('風雲目前停在台號時可用網站導覽自動切換到全車再加入暫存', () => {
  assert.match(pageHook, /ensureWindBetComponent/);
  assert.match(pageHook, /String\(element\.textContent \|\| ''\)\.trim\(\) === playType/);
  assert.match(pageHook, /link\.click\(\)/);
  assert.match(pageHook, /await ensureWindBetComponent\(store, requestedGame, playType\)/);
  assert.doesNotMatch(pageHook, /doBet\s*\(/);
  assert.match(source, /}, 5000\);/);
});

test('風雲目前停在其他遊戲時會先切換遊戲再切換玩法', () => {
  assert.match(pageHook, /windQuoteContext\(store\)\.game !== game/);
  assert.match(pageHook, /String\(element\.textContent \|\| ''\)\.trim\(\) === game/);
  assert.match(pageHook, /gameLink\.click\(\)/);
  assert.match(pageHook, /windQuoteContext\(store\)\.game !== requestedGame/);
  assert.doesNotMatch(pageHook, /request\.game !== '539'/);
});

test('風雲停留539時仍會從Vuex各遊戲快取回報加州彩報價', () => {
  assert.match(pageHook, /store\.getters\.seqs/);
  assert.match(pageHook, /state\?\.Play01\?\.numbers\?\.\[casino\]/);
  assert.match(pageHook, /state\?\.Play04\?\.numbers\?\.\[casino\]/);
  assert.match(pageHook, /contexts\.forEach\(\(\{ casino, game, phase \}\)/);
  assert.match(pageHook, /store\.dispatch\('Game\.c425\.update', casino\)/);
  assert.match(pageHook, /store\.dispatch\('Game\.c423\.update', casino\)/);
  assert.match(pageHook, /store\.dispatch\('Game\.bet\.group\.async', casino\)/);
  assert.match(pageHook, /state\?\.Game\?\.betGroups/);
  assert.match(pageHook, /casino === currentCasino/);
});

test('喜與風雲共用同型 Vuex 報價及暫存核心但保留網站名稱', () => {
  assert.match(pageHook, /\(\?:vs968\|kd998\)\\\.net/);
  assert.match(pageHook, /root === 'kd998\.net' \? '喜' : '風雲'/);
  assert.match(source, /\['vs968\.net', 'kd998\.net'\]\.includes/);
  assert.match(background, /quoteFrames\.has\(\[chosen\.report\.root, "539", "全車"\]/);
});

test('新增腳本可通過語法檢查', () => {
  new vm.Script(source);
  new vm.Script(popup);
  new vm.Script(bridge);
  new vm.Script(background);
});
