(() => {
  const demo = document.getElementById('ledgerDemo');
  if (!demo) return;
  const style = document.createElement('style'); style.textContent = '.ledger-calculator{margin-bottom:16px}.ledger-calc-body{padding:14px;display:grid;gap:10px}.ledger-calc-options{display:flex;flex-wrap:wrap;gap:8px}.ledger-calc-options label{padding:6px 9px;border:1px solid var(--line);border-radius:8px}.ledger-calc-options input[type=number]{width:82px;margin-left:6px;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px}.ledger-calc-result{line-height:1.8;color:var(--muted)}'; document.head.append(style);
  const panel = document.createElement('section');
  panel.className = 'ledger-calculator ledger-section';
  panel.innerHTML = '<div class="ledger-title"><b>自訂總和／基準除法</b><small>勾選玩法後計算</small></div><div class="ledger-calc-body"><div class="ledger-calc-options"></div><div class="ledger-calc-result">尚未選擇玩法</div></div>';
  demo.before(panel);
  const options = panel.querySelector('.ledger-calc-options');
  const result = panel.querySelector('.ledger-calc-result');
  const getSaved = () => { try { return JSON.parse(localStorage.getItem('ledgerCalculatorSelectionV2') || '{}'); } catch { return {}; } };
  const defaultDivisor = { '正碼': 5300, '全車': 5300, '二星': 5300, '三星': 57000 };
  const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');
  const refresh = () => {
    const selected = [...options.querySelectorAll('input[type=checkbox]:checked')].map(input => {
      const row = input.closest('label');
      return { game: row.dataset.game, name: input.value, total: Number(row.dataset.total) || 0, winning: Number(row.dataset.winning) || 0, divisor: Number(row.querySelector('input[type=number]').value) || 0 };
    });
    localStorage.setItem('ledgerCalculatorSelectionV2', JSON.stringify({ ...getSaved(), ...Object.fromEntries([...options.querySelectorAll('label')].map(label => [JSON.stringify([label.dataset.game, label.dataset.name]), { checked: label.querySelector('input[type=checkbox]').checked, divisor: label.querySelector('input[type=number]').value }])) }));
    if (!selected.length) { result.textContent = '尚未選擇玩法'; return; }
    result.replaceChildren();
    for (const game of new Set(selected.map(row => row.game))) {
    const gameRows = selected.filter(row => row.game === game);
    const total = gameRows.reduce((sum, row) => sum + row.total, 0);
    const winning = gameRows.reduce((sum, row) => sum + row.winning, 0);
    const divisions = gameRows.filter(row => row.divisor > 0).map(row => `${row.name} ${money(row.winning)} ÷ ${row.divisor.toLocaleString('en-US')} = ${(row.winning / row.divisor).toFixed(2)}`);
    const block = document.createElement('div');
    block.textContent = `${game}｜總量加總：${gameRows.map(row => money(row.total)).join(' ＋ ')} ＝ ${money(total)}；中獎加總：${gameRows.map(row => money(row.winning)).join(' ＋ ')} ＝ ${money(winning)}${divisions.length ? `；基準除法：${divisions.join('；')}；除法合計：${gameRows.reduce((sum,row)=>sum+(row.divisor>0?row.winning/row.divisor:0),0).toFixed(2)}` : ''}`;
    result.append(block);
    }
  };
  const sync = () => {
    const data = [...demo.querySelectorAll('.ledger-section.primary .ledger-game')].flatMap(block => {
      const game = block.querySelector('.ledger-title b')?.textContent.trim();
      return [...block.querySelectorAll('tbody tr')].map(row => [...row.cells].map(cell => cell.textContent.trim()))
        .filter(cells => game && cells.length >= 5 && cells[0] !== '盤口小計' && cells[0].replace(/\s/g, '') !== '無下注資料')
        .map(cells => ({ game, name: cells[0], total: Number(cells[2].replace(/[^0-9.-]/g, '')) || 0, winning: Number(cells[4].replace(/[^0-9.-]/g, '')) || 0 }));
    });
    // 總帳輪詢重繪時，表格可能短暫只有表頭；不可把使用者選項存成空白。
    if (!data.length) return;
    const saved = getSaved();
    options.replaceChildren(...data.map(row => { const label = document.createElement('label'); label.dataset.game = row.game; label.dataset.name = row.name; label.dataset.total = row.total; label.dataset.winning = row.winning; const prior = saved[JSON.stringify([row.game, row.name])] || {}; const divisor = prior.divisor ?? defaultDivisor[row.name] ?? ''; label.innerHTML = '<input type="checkbox"><span></span><input type="number" min="0" step="1" placeholder="除數">'; label.querySelector('span').textContent = ` ${row.game} ${row.name} `; const checkbox = label.querySelector('input[type=checkbox]'); checkbox.value = row.name; checkbox.checked = !!prior.checked; label.querySelector('input[type=number]').value = divisor; checkbox.addEventListener('change', refresh); label.querySelector('input[type=number]').addEventListener('input', refresh); return label; }));
    refresh();
  };
  new MutationObserver(sync).observe(demo, { childList: true, subtree: true });
  sync();
})();
