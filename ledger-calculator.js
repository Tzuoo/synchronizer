(() => {
  const demo = document.getElementById('ledgerDemo');
  if (!demo) return;

  const style = document.createElement('style');
  style.textContent = `
    .ledger-calculator{margin-bottom:16px;min-width:0}
    .ledger-calc-body{padding:14px;display:grid;gap:12px;min-width:0;overflow:hidden}
    .ledger-calc-options,.ledger-calc-result{display:grid;gap:12px;min-width:0}
    .ledger-calc-option-game{display:grid;gap:8px;padding:10px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.018);min-width:0}
    .ledger-calc-option-title{font-weight:800;padding-left:8px;border-left:4px solid var(--muted);color:var(--text)}
    .ledger-calc-option-game.calc-game-539 .ledger-calc-option-title{border-color:var(--blue);color:var(--blue)}
    .ledger-calc-option-game.calc-game-six .ledger-calc-option-title{border-color:#c084fc;color:#d8b4fe}
    .ledger-calc-option-game.calc-game-big .ledger-calc-option-title{border-color:var(--yellow);color:var(--yellow)}
    .ledger-calc-option-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(238px,1fr));gap:8px;min-width:0}
    .ledger-calc-option{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) 92px;align-items:center;gap:7px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;min-width:0}
    .ledger-calc-option-main{display:flex;align-items:center;gap:7px;min-width:0}
    .ledger-calc-option-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ledger-calc-option input[type=number]{box-sizing:border-box;width:100%;min-width:0;margin:0;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px}
    .ledger-calc-game{display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.018);min-width:0}
    .ledger-calc-game-title{font-weight:800;color:var(--text)}
    .ledger-calc-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .ledger-calc-summary>div{padding:9px 10px;border-radius:8px;background:var(--bg);border:1px solid var(--line);min-width:0}
    .ledger-calc-summary small{display:block;color:var(--muted);font-size:12px}
    .ledger-calc-summary b{display:block;margin-top:2px;color:var(--text);font-size:18px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .ledger-calc-summary .calc-multiplier b{color:var(--yellow)}
    .ledger-calc-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
    .ledger-calc-table th,.ledger-calc-table td{padding:8px 9px;border-bottom:1px solid var(--line);text-align:right}
    .ledger-calc-table th:first-child,.ledger-calc-table td:first-child{text-align:left}
    .ledger-calc-table th{color:var(--muted);font-size:12px;font-weight:600}
    .ledger-calc-table td:last-child{color:var(--yellow);font-weight:800}
    .ledger-calc-details{color:var(--muted);font-size:13px;min-width:0}
    .ledger-calc-details summary{cursor:pointer;color:var(--blue);width:max-content}
    .ledger-calc-detail-lines{display:grid;gap:3px;padding:8px 0 0;line-height:1.55;overflow-wrap:anywhere}
    @media(max-width:640px){
      .ledger-calc-body{padding:12px}
      .ledger-calc-option-grid{grid-template-columns:minmax(0,1fr)}
      .ledger-calc-option{grid-template-columns:minmax(0,1fr) minmax(74px,102px);width:100%}
      .ledger-calc-summary{grid-template-columns:1fr}
      .ledger-calc-table th,.ledger-calc-table td{padding:7px 5px;font-size:13px}
    }
  `;
  document.head.append(style);

  const panel = document.createElement('section');
  panel.className = 'ledger-calculator ledger-section';
  panel.innerHTML = '<div class="ledger-title"><b>自訂總和／基準除法</b><small>勾選玩法後計算</small></div><div class="ledger-calc-body"><div class="ledger-calc-options"></div><div class="ledger-calc-result">尚未選擇玩法</div></div>';
  demo.before(panel);
  const options = panel.querySelector('.ledger-calc-options');
  const result = panel.querySelector('.ledger-calc-result');
  const getSaved = () => { try { return JSON.parse(localStorage.getItem('ledgerCalculatorSelectionV2') || '{}'); } catch { return {}; } };
  const defaultDivisor = { '正碼': 5300, '全車': 5300, '二星': 5300, '三星': 57000 };
  const divisorFor = name => /^三星\s*[（(]\s*套餐\s*[）)]$/.test(name) ? 57000 : defaultDivisor[name];
  const playRank = name => /^三星/.test(name) ? 3 : /^四星/.test(name) ? 4 : name === '二星' ? 2 : name === '全車' ? 1 : name === '正碼' ? 0 : 5;
  const money = value => '$' + Math.round(Number(value) || 0).toLocaleString('en-US');
  const gameClass = game => game === '539' ? 'calc-game-539' : game === '六合' ? 'calc-game-six' : game === '大樂' ? 'calc-game-big' : '';

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
      const multiplier = gameRows.reduce((sum, row) => sum + (row.divisor > 0 ? row.winning / row.divisor : 0), 0);
      const block = document.createElement('section'); block.className = `ledger-calc-game ${gameClass(game)}`;
      const title = document.createElement('div'); title.className = 'ledger-calc-game-title'; title.textContent = game; block.append(title);
      const summary = document.createElement('div'); summary.className = 'ledger-calc-summary';
      [['總量', money(total), ''], ['中獎', money(winning), ''], ['除法合計', multiplier.toFixed(2), 'calc-multiplier']].forEach(([label, value, className]) => { const card = document.createElement('div'); card.className = className; const caption = document.createElement('small'); caption.textContent = label; const amount = document.createElement('b'); amount.textContent = value; card.append(caption, amount); summary.append(card); });
      block.append(summary);
      const table = document.createElement('table'); table.className = 'ledger-calc-table'; table.innerHTML = '<thead><tr><th>玩法</th><th>中獎</th><th>除數</th><th>倍數</th></tr></thead>';
      const body = document.createElement('tbody'); gameRows.forEach(row => { const tr = document.createElement('tr'); [row.name, money(row.winning), row.divisor > 0 ? row.divisor.toLocaleString('en-US') : '未設定', row.divisor > 0 ? (row.winning / row.divisor).toFixed(2) : '—'].forEach(value => { const cell = document.createElement('td'); cell.textContent = value; tr.append(cell); }); body.append(tr); }); table.append(body); block.append(table);
      const details = document.createElement('details'); details.className = 'ledger-calc-details'; const detailTitle = document.createElement('summary'); detailTitle.textContent = '查看加總過程'; const lines = document.createElement('div'); lines.className = 'ledger-calc-detail-lines'; ['總量加總：' + gameRows.map(row => money(row.total)).join(' ＋ ') + ' ＝ ' + money(total), '中獎加總：' + gameRows.map(row => money(row.winning)).join(' ＋ ') + ' ＝ ' + money(winning)].forEach(text => { const line = document.createElement('div'); line.textContent = text; lines.append(line); }); details.append(detailTitle, lines); block.append(details);
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
    if (!data.length) return;
    const saved = getSaved();
    const gameOrder = [...new Set(data.map(row => row.game))];
    data.sort((a, b) => gameOrder.indexOf(a.game) - gameOrder.indexOf(b.game) || playRank(a.name) - playRank(b.name));
    const gameGroups = new Map();
    data.forEach(row => { const rows = gameGroups.get(row.game) || []; rows.push(row); gameGroups.set(row.game, rows); });
    options.replaceChildren(...[...gameGroups].map(([game, rows]) => {
      const group = document.createElement('section'); group.className = `ledger-calc-option-game ${gameClass(game)}`;
      const title = document.createElement('div'); title.className = 'ledger-calc-option-title'; title.textContent = game;
      const grid = document.createElement('div'); grid.className = 'ledger-calc-option-grid';
      rows.forEach(row => {
        const label = document.createElement('label'); label.className = 'ledger-calc-option'; label.dataset.game = row.game; label.dataset.name = row.name; label.dataset.total = row.total; label.dataset.winning = row.winning;
        const prior = saved[JSON.stringify([row.game, row.name])] || {};
        const divisor = (prior.divisor === '' && divisorFor(row.name) === 57000 ? 57000 : prior.divisor) ?? divisorFor(row.name) ?? '';
        label.innerHTML = '<span class="ledger-calc-option-main"><input type="checkbox"><span></span></span><input type="number" min="0" step="1" placeholder="除數">';
        label.querySelector('.ledger-calc-option-main span').textContent = row.name;
        const checkbox = label.querySelector('input[type=checkbox]'); checkbox.value = row.name; checkbox.checked = !!prior.checked;
        label.querySelector('input[type=number]').value = divisor;
        checkbox.addEventListener('change', refresh); label.querySelector('input[type=number]').addEventListener('input', refresh);
        grid.append(label);
      });
      group.append(title, grid); return group;
    }));
    refresh();
  };

  new MutationObserver(sync).observe(demo, { childList: true, subtree: true });
  sync();
})();
