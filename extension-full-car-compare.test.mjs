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
  assert.match(background, /目前沒有已開啟且可取得 \$\{game\} \$\{playType\} 報價的網站/);
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
  assert.match(background, /quoteFrames\.has\(\[chosen\.report\.root, game, playType\]/);
});

test('金好運天天樂全車依實際頁面標題辨識，並可用隱藏同源框架續讀報價', () => {
  assert.match(source, /activeFullCarGame/);
  assert.match(source, /\(\?:539\|天天樂\)\\s\*\[-－\]\\s\*全車/);
  assert.match(source, /game: page\.game/);
  assert.match(source, /SYNC_FULL_CAR_ROUTE/);
  assert.match(source, /backgroundQuoteRoutes\.set\(`\$\{game\}\|\$\{playType\}`/);
  assert.match(source, /\/\/ 第一次離開全車頁前立刻建立續讀框架[\s\S]*ensureBackgroundFullCar\(\)/);
  assert.match(source, /data-sync-full-car/);
  assert.match(source, /new MutationObserver/);
  assert.match(source, /characterData: true/);
  assert.match(source, /setTimeout\(reportFullCarPage, 120\)/);
  assert.match(source, /\['bnd139\.com', 'and539\.com'\]\.includes\(root\)/);
  assert.match(background, /const fullCarFrameKey/);
  assert.match(background, /fullCarFrames\.set\(fullCarFrameKey\(report\)/);
  assert.match(background, /game = String\(message\.game \|\| '539'\)/);
  assert.match(background, /FULL_CAR_PREFLIGHT", root: target\.root, game: target\.game/);
});

test('海勝2 539 全車與台號分開讀取並各自保留背景框架', () => {
  assert.match(source, /const TAIHAO_ROUTE = \/\\\/Front\\\/B\\\/B04/);
  assert.ok(source.includes('const LEGACY_QUOTE_ROUTE = /\\/Front\\/B\\/(?:B02|B04)'));
  assert.match(source, /Object\.keys\(quotes\)\.length !== \(isFullCar \? 39 : 100\)/);
  assert.match(source, /playType: page\.playType/);
  assert.match(source, /backgroundQuoteRoutes\.forEach/);
  assert.match(source, /dataset\.syncQuoteKey = key/);
  assert.match(source, /sync-quote-\$\{route\.playType === '台號'/);
  assert.match(source, /if \(LEGACY_QUOTE_ROUTE\.test\(location\.href\)\)/);
});

test('舊版台號可參與比價，但尚未支援加入的網站維持唯讀', async () => {
  const dashboard = await read(new URL('../GitHub網頁原始碼/full-car-dashboard.js', import.meta.url));
  assert.match(dashboard, /function planCanAdd\(\)/);
  assert.match(dashboard, /target\.playType==='台號'&&target\.channel==='fullCar'/);
  assert.match(dashboard, /GET_FULL_CAR_REPORTS/);
  assert.match(dashboard, /GET_QUOTE_REPORTS/);
  assert.doesNotMatch(dashboard, /x\.root==='vs968\.net'&&x\.game===state\.game&&x\.playType===state\.playType/);
});

test('金好運與海勝2加入暫存一律改由可見全車工作頁確認，並可在同遊戲內自動跳轉', () => {
  assert.match(source, /SYNC_BND_VISIBLE_FULL_CAR_COMMAND/);
  assert.match(source, /window\.top !== window/);
  assert.match(source, /legacyVisibleFullCar/);
  assert.match(source, /clickLegacyFullCarNavigation/);
  assert.match(source, /waitForVisibleLegacyFullCar/);
  assert.match(source, /\['bnd139\.com', 'and539\.com'\]\.includes\(rootDomain\(location\.hostname\)\).*window\.top !== window/);
  assert.match(source, /root: message\.root/);
  assert.match(source, /querySelectorAll\('a,button,input\[type="button"\],\[onclick\]'\)/);
  assert.match(source, /backgroundQuoteRoutes\.get\(`\$\{game\}\|全車`\)/);
  assert.match(source, /frame\.location\.href = route\.url/);
  assert.match(source, /waitForMatchingLegacyFullCar/);
  assert.match(source, /switched \? await waitForMatchingLegacyFullCar\(frame, orders\)/);
  assert.match(source, /message\.command === 'PREFLIGHT'\) return \{ ok: true, needsNavigation: true \}/);
  assert.match(source, /預檢不可先切頁/);
  assert.match(source, /\}, 12000\);/);
  assert.match(source, /網站未確認左側清單已更新，未回報加入成功/);
  assert.match(source, /dataset\?\.syncFullCar/);
  assert.match(source, /String\(element\.textContent \|\| element\.value \|\| ''\)\.trim\(\) === '全車'/);
  assert.doesNotMatch(source, /=== '送出注單'/);
});

test('舊版網站框架沒有 randomUUID 時仍可建立訊息配對 ID', () => {
  assert.match(source, /function createFullCarRequestId/);
  assert.match(source, /typeof crypto\?\.randomUUID === 'function'/);
  assert.match(source, /crypto\?\.getRandomValues/);
  assert.doesNotMatch(source, /const requestId = crypto\.randomUUID\(\)/);
});

test('新增腳本可通過語法檢查', () => {
  new vm.Script(source);
  new vm.Script(popup);
  new vm.Script(bridge);
  new vm.Script(background);
});
