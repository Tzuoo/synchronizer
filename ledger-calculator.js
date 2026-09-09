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
  const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');
  const refresh = () => {
    const selected = [...options.querySelectorAll('input[type=checkbox]:checked')].map(input => {
      const row = input.closest('label');
      return { name: input.value, total: Number(row.dataset.total) || 0, winning: Number(row.dataset.winning) || 0, divisor: Number(row.querySelector('input[type=number]').value) || 0 };
    });
    if (!selected.length) { result.textContent = '尚未選擇玩法'; return; }
    const total = selected.reduce((sum, row) => sum + row.total, 0);
    const winning = selected.reduce((sum, row) => sum + row.winning, 0);
    const divisions = selected.filter(row => row.divisor > 0).map(row => `${row.name} ${money(row.winning)} ÷ ${row.divisor.toLocaleString('en-US')} = ${(row.winning / row.divisor).toFixed(2)}`);
    result.innerHTML = `<div>總量加總：${selected.map(row => money(row.total)).join(' ＋ ')} ＝ <b>${money(total)}</b></div><div>中獎加總：${selected.map(row => money(row.winning)).join(' ＋ ')} ＝ <b>${money(winning)}</b></div>${divisions.length ? `<div>基準除法：${divisions.join('；')}</div><div>除法合計：${selected.reduce((sum,row)=>sum+(row.divisor>0?row.winning/row.divisor:0),0).toFixed(2)}</div>` : ''}`;
  };
  const sync = () => {
    const table = demo.querySelector('.ledger-section.primary table');
    if (!table) return;
    const rows = [...table.querySelectorAll('tbody tr')].map(row => [...row.cells].map(cell => cell.textContent.trim()));
    const data = rows.filter(cells => cells.length >= 5 && cells[0] !== '盤口小計').map(cells => ({ name: cells[0], total: Number(cells[2].replace(/[^0-9.-]/g, '')) || 0, winning: Number(cells[4].replace(/[^0-9.-]/g, '')) || 0 }));
    const old = new Map([...options.querySelectorAll('label')].map(label => [label.dataset.name, label.querySelector('input[type=number]').value]));
    options.replaceChildren(...data.map(row => { const label = document.createElement('label'); label.dataset.name = row.name; label.dataset.total = row.total; label.dataset.winning = row.winning; label.innerHTML = `<input type="checkbox" value="${row.name}"> ${row.name} <input type="number" min="0" step="1" placeholder="除數" value="${old.get(row.name) || ''}">`; label.querySelector('input[type=checkbox]').addEventListener('change', refresh); label.querySelector('input[type=number]').addEventListener('input', refresh); return label; }));
    refresh();
  };
  new MutationObserver(sync).observe(demo, { childList: true, subtree: true });
  sync();
})();
