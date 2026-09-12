import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('自訂總和讀取所有盤口，以遊戲與玩法保存並分開計算', () => {
  const source = readFileSync(new URL('../ledger-calculator.js', import.meta.url), 'utf8');
  assert.ok(source.includes("querySelectorAll('.ledger-section.primary .ledger-game')"));
  assert.ok(source.includes('JSON.stringify([label.dataset.game, label.dataset.name])'));
  assert.ok(source.includes('selected.filter(row => row.game === game)'));
  assert.ok(source.includes('...getSaved()'));
  assert.ok(source.includes('if (!data.length) return'));
  assert.ok(source.includes("'三星': 57000"));
});

test('提示列不參與總帳與計算，真實零金額玩法不依金額排除', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const calculator = readFileSync(new URL('../ledger-calculator.js', import.meta.url), 'utf8');
  assert.ok(html.includes("rows.filter(row=>String(row.playType||'').replace(/\\s/g,'')!=='無下注資料')"));
  assert.ok(calculator.includes("cells[0].replace(/\\s/g, '') !== '無下注資料'"));
});
