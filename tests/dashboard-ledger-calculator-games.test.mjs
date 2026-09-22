import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('三星套餐緊接三星、三星與四星除數預設正確且結果以摘要和表格呈現', () => {
  const source = readFileSync(new URL('../ledger-calculator.js', import.meta.url), 'utf8');
  const helpers = source.split('\n').filter(line => /const (defaultDivisor|divisorFor|savedDivisorFor|playRank) =/.test(line)).join('\n');
  const context = vm.createContext({});
  vm.runInContext(helpers, context);
  assert.equal(vm.runInContext("divisorFor('三星 (套餐)')", context), 57000);
  assert.equal(vm.runInContext("divisorFor('三星（套餐）')", context), 57000);
  assert.equal(vm.runInContext("divisorFor('四星')", context), 750000);
  assert.equal(vm.runInContext("savedDivisorFor('', '四星')", context), 750000);
  assert.equal(vm.runInContext("savedDivisorFor('680000', '四星')", context), '680000');
  assert.equal(vm.runInContext("['三星','四星','三星 (套餐)'].sort((a,b)=>playRank(a)-playRank(b)).join('|')", context), '三星|三星 (套餐)|四星');
  assert.ok(source.includes("ledger-calc-summary"));
  assert.ok(source.includes("ledger-calc-table"));
  assert.ok(source.includes("查看加總過程"));
  assert.match(source, /\['總量',\s*money\(total\),\s*''\]/);
  assert.ok(source.includes("ledger-calc-option-game"));
  assert.ok(source.includes("ledger-calc-option-grid"));
  assert.ok(source.includes("ledgerCalculatorOpenGamesV1"));
  assert.ok(source.includes("ledger-calc-option-game:not(.is-open) .ledger-calc-option-grid{display:none}"));
  assert.ok(source.includes("aria-expanded"));
  assert.ok(source.includes("titleState.textContent = openGames.has(game) ? '收合' : '展開'"));
});

test('自訂總和讀取所有盤口，以遊戲與玩法保存並分開計算', () => {
  const source = readFileSync(new URL('../ledger-calculator.js', import.meta.url), 'utf8');
  assert.ok(source.includes("querySelectorAll('.ledger-section.primary .ledger-game')"));
  assert.ok(source.includes('JSON.stringify([label.dataset.game, label.dataset.name])'));
  assert.ok(source.includes('selected.filter(row => row.game === game)'));
  assert.ok(source.includes('...getSaved()'));
  assert.ok(source.includes('if (!data.length) return'));
  assert.ok(source.includes("'三星': 57000"));
  assert.ok(source.includes("'四星': 750000"));
  assert.ok(source.includes('const gameGroups = new Map()'));
  assert.ok(source.includes('gameGroups.get(row.game)'));
  assert.ok(source.includes('calc-game-539'));
  assert.ok(source.includes('@media(max-width:640px)'));
  assert.ok(source.includes('grid-template-columns:minmax(0,1fr)'));
  assert.ok(source.includes('title.addEventListener(\'click\''));
  assert.ok(source.includes('saveOpenGames(openGames); sync()'));
});

test('提示列不參與總帳與計算，真實零金額玩法不依金額排除', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const calculator = readFileSync(new URL('../ledger-calculator.js', import.meta.url), 'utf8');
  assert.ok(html.includes("rows.filter(row=>String(row.playType||'').replace(/\\s/g,'')!=='無下注資料')"));
  assert.ok(calculator.includes("cells[0].replace(/\\s/g, '') !== '無下注資料'"));
});
