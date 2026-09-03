// Diagnostic values are escaped even though the API accepts only fixed codes.
let remoteDiagnosticRows = [], remoteDiagnosticBusy = false;
const diagnosticStageNames = { frame:'工作框', read:'背景抓取', parse:'明細解析', upload:'明細上傳', ledger:'總帳抓取', ledgerUpload:'總帳上傳', heartbeat:'連線心跳' };
const diagnosticCodeNames = { OK:'成功', EMPTY:'回應為 0 筆，需對照網站', WAIT_REQUEST:'等待開啟一次下注明細', WAIT_FRAME:'尚未偵測到網站工作框', READ_FAILED:'讀取失敗（連線或網站請求）', PARSE_FAILED:'解析失敗', UPLOAD_FAILED:'上傳失敗', LEDGER_FAILED:'總帳請求失敗', HTTP_401:'驗證失效（HTTP 401）', HTTP_403:'存取遭拒（HTTP 403）', HTTP_429:'請求過於頻繁（HTTP 429）', HTTP_5XX:'伺服器錯誤（HTTP 5xx）' };
const diagnosticSiteNames = { 'vs968.net':'風雲', 'kd998.net':'喜', 'hyp98.com':'98', '188hot.net':'16', 'umh693.com':'海勝', 'and539.com':'海勝2', 'pee688.com':'航海', 'bnd139.com':'28' };
function remoteDeviceLabel(id) {
  const latest = remoteDiagnosticRows.filter(row => row.installationId === id).sort((a,b) => String(b.reportedAt).localeCompare(String(a.reportedAt)))[0];
  return `${latest?.deviceLabel || '未命名裝置'} · ${String(id).slice(-8)}`;
}
function diagnosticTime(value) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-TW') : '尚未回報'; }
function diagnosticHistory(row) {
  if (!row.lastErrorAt) return '尚無錯誤紀錄';
  const recovery = row.recoveredAt ? `已恢復：${diagnosticTime(row.recoveredAt)}` : '尚未確認恢復';
  return `最後錯誤：${diagnosticCodeNames[row.lastErrorCode] || '未知錯誤'}（${diagnosticTime(row.lastErrorAt)}） · ${recovery}`;
}
function renderRemoteDiagnostics(rows) {
  remoteDiagnosticRows = rows;
  const target = document.querySelector('#remoteDiagnostics');
  const opened = new Set([...target.querySelectorAll('details[open]')].map(node => node.dataset.device));
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.installationId)) groups.set(row.installationId, []);
    groups.get(row.installationId).push(row);
  }
  const cards = [...groups].sort(([a],[b]) => a.localeCompare(b)).map(([id, entries]) => {
    const lastSeen = Math.max(0, ...entries.map(row => Date.parse(row.lastSeen) || 0));
    const online = Date.now() - lastSeen <= 45000;
    const unresolved = entries.filter(row => row.lastErrorAt && !row.recoveredAt).length;
    const body = entries.map(row => {
      const siteOnline = Date.now() - (Date.parse(row.lastSeen) || 0) <= 45000;
      const fresh = Date.now() - (Date.parse(row.eventAt) || 0) <= 120000;
      const state = !siteOnline ? '網站已離線；以下為最後紀錄' : !fresh ? '此階段尚無近期回報' : '最新回報';
      return `<div class="diagnostic-line"><b>${escapeHtml(diagnosticSiteNames[row.site] || row.site)} · ${escapeHtml(diagnosticStageNames[row.stage] || row.stage)}</b><span class="diagnostic-${row.status === 'error' ? 'error' : row.status === 'ok' ? 'ok' : 'waiting'}">${escapeHtml(diagnosticCodeNames[row.code] || '未辨識狀態')}${row.count == null ? '' : ` · ${Number(row.count)} 筆`}</span><small>${escapeHtml(state)} · ${escapeHtml(diagnosticTime(row.eventAt))}</small><small class="diagnostic-history">${escapeHtml(diagnosticHistory(row))}</small></div>`;
    }).join('');
    return `<details data-device="${escapeHtml(id)}" ${opened.has(id) ? 'open' : ''}><summary>${escapeHtml(remoteDeviceLabel(id))} · ${online ? '有網站在線' : '已離線'} · ${unresolved ? `${unresolved} 個階段尚未確認恢復` : '無未恢復錯誤'}</summary><small>裝置識別：${escapeHtml(id)} · 最後診斷上傳 ${escapeHtml(diagnosticTime(entries.reduce((latest,row) => row.reportedAt > latest ? row.reportedAt : latest, '')))}</small>${body}</details>`;
  }).join('');
  target.innerHTML = `<b>遠端診斷</b><p>依裝置保存最後錯誤，關站或恢復後仍保留。0 筆不等於確認正常；舊版未回報不代表沒有錯誤。</p>${cards || '<p>尚無遠端診斷。請待新版擴充啟用後回報。</p>'}`;
  renderClientStatus(clientStatusRows);
}
async function loadRemoteDiagnostics() {
  if (!authToken || remoteDiagnosticBusy) return;
  remoteDiagnosticBusy = true;
  const token = authToken;
  try {
    const response = await fetch(`${API_ROOT}/diagnostics`, { cache:'no-store', headers:authHeaders(), signal:AbortSignal.timeout(15000) });
    if (token !== authToken) return;
    if (response.status === 401) { document.querySelector('#remoteDiagnostics').textContent = ''; remoteDiagnosticRows = []; requireLogin(); return; }
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (token === authToken) renderRemoteDiagnostics(data.diagnostics || []);
  } catch {
    if (token === authToken) document.querySelector('#remoteDiagnostics').textContent = '遠端診斷暫時無法取得，稍後自動重試。';
  } finally { remoteDiagnosticBusy = false; }
}
