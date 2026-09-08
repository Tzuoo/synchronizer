(() => {
  const state = { orders: [], selected: new Set(), plan: null };
  const byId = id => document.getElementById(id);
  const requestExtension = (type, payload = {}) => new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener('message', receive); reject(new Error('本機擴充未連線，請確認已重新載入')); }, 4000);
    function receive(event) {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'synchronizer-extension' || event.data.requestId !== requestId) return;
      clearTimeout(timer); window.removeEventListener('message', receive); resolve(event.data.response || {});
    }
    window.addEventListener('message', receive);
    window.postMessage({ source: 'synchronizer-dashboard', requestId, type, ...payload }, location.origin);
  });
  const normalizeNumber = value => {
    const number = String(value || '').trim().padStart(2, '0');
    return /^(0[1-9]|[12]\d|3\d)$/.test(number) ? number : '';
  };
  const readCars = value => { const cars = Number(value); return Number.isFinite(cars) && cars > 0 ? cars : 0; };
  function renderOrders() {
    const host = byId('fullCarSelected');
    if (!host) return;
    host.innerHTML = state.orders.length ? state.orders.map((order, index) => `<div class="selected-order"><strong>${order.number}</strong><label>車數 <input data-car-index="${index}" value="${order.cars}" inputmode="decimal"></label><span>${order.site ? `${order.site}（${order.price}${order.tied ? '，同價平均' : ''}）` : '尚未比價'}</span><button type="button" data-remove-index="${index}">刪除</button></div>`).join('') : '<div class="empty">尚未輸入號碼</div>';
    host.querySelectorAll('[data-remove-index]').forEach(button => button.onclick = () => { state.orders.splice(Number(button.dataset.removeIndex), 1); state.plan = null; renderOrders(); });
    host.querySelectorAll('[data-car-index]').forEach(input => input.onchange = () => { const cars = readCars(input.value); if (cars) state.orders[Number(input.dataset.carIndex)].cars = cars; else input.value = state.orders[Number(input.dataset.carIndex)].cars; state.plan = null; });
    byId('fullCarAdd').disabled = !state.plan;
  }
  function addOrder(numberValue, carsValue) {
    const number = normalizeNumber(numberValue), cars = readCars(carsValue);
    if (!number || !cars) throw new Error('請輸入 01～39 的號碼與大於 0 的車數');
    state.orders.push({ number, cars }); state.plan = null; renderOrders();
  }
  const ranges = {
    '紅波': [1,2,7,8,12,13,18,19,23,24,29,30,34,35],
    '藍波': [3,4,9,10,14,15,20,25,26,31,36,37],
    '綠波': [5,6,11,16,17,21,22,27,28,32,33,38,39],
    '單': Array.from({length:39},(_,i)=>i+1).filter(n=>n%2), '雙': Array.from({length:39},(_,i)=>i+1).filter(n=>n%2===0),
    '大': Array.from({length:20},(_,i)=>i+20), '小': Array.from({length:19},(_,i)=>i+1), '全': Array.from({length:39},(_,i)=>i+1),
    '總和單': Array.from({length:39},(_,i)=>i+1).filter(n=>(Math.floor(n/10)+n%10)%2),
    '總和雙': Array.from({length:39},(_,i)=>i+1).filter(n=>(Math.floor(n/10)+n%10)%2===0),
    '總和大': Array.from({length:39},(_,i)=>i+1).filter(n=>Math.floor(n/10)+n%10>=10),
    '總和小': Array.from({length:39},(_,i)=>i+1).filter(n=>Math.floor(n/10)+n%10<10)
  };
  function toggleNumbers(numbers) {
    const normalized = numbers.map(n => String(n).padStart(2, '0'));
    const remove = normalized.every(number => state.selected.has(number));
    normalized.forEach(number => remove ? state.selected.delete(number) : state.selected.add(number));
    refreshQuickButtons();
  }
  function refreshQuickButtons() {
    document.querySelectorAll('[data-quick-key]').forEach(button => {
      const numbers = (ranges[button.dataset.quickKey] || []).map(n => String(n).padStart(2, '0'));
      button.classList.toggle('selected', numbers.length > 0 && numbers.every(number => state.selected.has(number)));
    });
  }
  function buttons(host, labels, className = '') {
    host.innerHTML = labels.map(label => `<button type="button" data-quick-key="${label}" class="${className && label.includes('波') ? `wave-${label[0]==='紅'?'red':label[0]==='藍'?'blue':'green'}` : ''}">${label}</button>`).join('');
    host.querySelectorAll('button').forEach(button => button.onclick = () => toggleNumbers(ranges[button.dataset.quickKey] || []));
  }
  async function compare() {
    const display = byId('fullCarPlan'); state.plan = null; byId('fullCarAdd').disabled = true;
    if (!state.orders.length) { display.textContent = '請先輸入號碼與車數'; display.className = 'full-car-plan warn'; return; }
    try {
      const response = await requestExtension('PLAN_FULL_CAR', { orders: state.orders.map(({number,cars}) => ({number,cars})) });
      if (!response.ok) throw new Error(response.error || '比價失敗');
      state.plan = response.plan;
      state.orders = response.plan.map(target => ({ ...target.orders[0], site: target.siteName, tied: target.tied }));
      display.textContent = `期數 ${response.phase}\n` + state.orders.map(order => `${order.number} × ${order.cars}車 → ${order.site}（${order.price}${order.tied ? '，同價平均' : ''}）`).join('\n');
      display.className = 'full-car-plan ok'; byId('fullCarConnection').textContent = '兩站已連線'; renderOrders();
    } catch (error) { display.textContent = String(error?.message || error); display.className = 'full-car-plan warn'; byId('fullCarConnection').textContent = '擴充或網站未連線'; }
  }
  window.initFullCarDashboard = () => {
    if (byId('comparePanel')?.dataset.ready) return; byId('comparePanel').dataset.ready = '1';
    buttons(byId('fullCarQuickButtons'), ['紅波','藍波','綠波','單','雙','大','小','全'], 'wave');
    [0,1,2,3].forEach(n => ranges[`頭${n}`] = Array.from({length:39},(_,i)=>i+1).filter(v=>Math.floor(v/10)===n)); buttons(byId('fullCarTens'), [0,1,2,3].map(n=>`頭${n}`));
    for(let n=0;n<=9;n++)ranges[`尾${n}`]=Array.from({length:39},(_,i)=>i+1).filter(v=>v%10===n); buttons(byId('fullCarUnits'), Array.from({length:10},(_,n)=>`尾${n}`));
    buttons(byId('fullCarSums'), ['總和單','總和雙','總和大','總和小']);
    const submitDirect = () => { try { addOrder(byId('fullCarNumber').value, byId('fullCarCars').value); byId('fullCarNumber').value=''; byId('fullCarNumber').focus(); } catch(error) { byId('fullCarPlan').textContent=error.message; byId('fullCarPlan').className='full-car-plan warn'; } };
    [byId('fullCarNumber'),byId('fullCarCars')].forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitDirect()}}));
    byId('fullCarFastFocus').onclick=()=>byId('fullCarNumber').focus();
    byId('fullCarApplyCars').onclick=()=>{const cars=readCars(byId('fullCarAddCars').value);if(!cars||!state.selected.size){byId('fullCarPlan').textContent='請先快速選號並輸入累加車數';byId('fullCarPlan').className='full-car-plan warn';return}[...state.selected].sort().forEach(number=>state.orders.push({number,cars}));state.selected.clear();refreshQuickButtons();state.plan=null;renderOrders()};
    byId('fullCarClear').onclick=()=>{state.orders=[];state.selected.clear();refreshQuickButtons();state.plan=null;renderOrders();byId('fullCarPlan').textContent='請先輸入號碼與車數'};
    byId('fullCarCompare').onclick=compare;
    byId('fullCarAdd').onclick=async()=>{if(!state.plan)return;byId('fullCarAdd').disabled=true;try{const response=await requestExtension('FULL_CAR_ADD_SEQUENCE',{targets:state.plan});if(!response.ok)throw new Error(response.error||'加入清單失敗');byId('fullCarPlan').textContent+='\n已加入各站左側清單；尚未送出注單。';state.plan=null}catch(error){byId('fullCarPlan').textContent=String(error?.message||error);byId('fullCarPlan').className='full-car-plan warn';byId('fullCarAdd').disabled=false}};
    renderOrders(); requestExtension('GET_FULL_CAR_REPORTS').then(r=>{byId('fullCarConnection').textContent=(r.reports||[]).filter(x=>['and539.com','bnd139.com'].includes(x.root)).length===2?'兩站已連線':'等待兩站全車頁'}).catch(()=>byId('fullCarConnection').textContent='本機擴充未連線');
  };
})();
