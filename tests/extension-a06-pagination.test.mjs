import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const root=new URL('../../RuntimeData/同步器擴充功能/',import.meta.url);
const hook=await readFile(new URL('page-hook.js',root),'utf8');
const frames=await readFile(new URL('src/content/frames.js',root),'utf8');
function extract(name){
  const start=hook.indexOf(`  async function ${name}(`);
  const end=hook.indexOf('\n  }',start);
  assert.ok(start>=0&&end>start,`${name} missing`);
  return hook.slice(start,end+4);
}
const collectSource=()=>extract('collectA06Pages');
const page=(ids,total=ids.length)=>({TotalCnt:total,DataList:[{GameID:13,GameName:'539',PhasesName:'C115247',Master:ids.map(ID=>({ID,RowID:ID,Detail:[{OddsRate:53}]}))}]});

test('背景已調成50筆仍須要求完整分頁；前景不操作',()=>{
  const source=frames.match(/^function expandBackgroundDetailPageSize\([^]*?^}/m)[0];
  const messages=[];
  const c=vm.createContext({isInsideSyncDetailFrame:()=>true,document:{querySelectorAll:()=>[{value:'50',options:[{textContent:'15',value:'15'},{textContent:'50',value:'50'}]}]},window:{postMessage:m=>messages.push(m)}});
  vm.runInContext(source,c);c.expandBackgroundDetailPageSize();
  assert.equal(messages[0]?.type,'SYNC_READ_A06_ALL');
  c.isInsideSyncDetailFrame=()=>false;c.expandBackgroundDetailPageSize();assert.equal(messages.length,1);
});

test('A06 必須從第一頁補讀超過50批，不依賴目前第二頁，保留原批次及順序',async()=>{
  const c=vm.createContext({});vm.runInContext(collectSource(),c);
  const calls=[];
  const result=await c.collectA06Pages({GameID:[13],SortType:2,PageID:2,PageSize:15},async params=>{
    calls.push(params);const offset=(params.PageID-1)*50;
    return page(Array.from({length:Math.min(50,123-offset)},(_,i)=>String(offset+i+1)),123);
  });
  assert.deepEqual(calls.map(p=>p.PageID),[1,2,3]);
  assert.ok(calls.every(p=>p.PageSize===50&&p.SortType===2&&p.GameID[0]===13));
  assert.equal(result.TotalCnt,123);
  assert.deepEqual(Array.from(result.DataList).flatMap(g=>Array.from(g.Master,m=>m.ID)),Array.from({length:123},(_,i)=>String(i+1)));
});

test('A06 空、少量、50／51批與不同盤口保持來源格式',async()=>{
  const c=vm.createContext({});vm.runInContext(collectSource(),c);
  for(const total of [0,1,50,51]){
    const result=await c.collectA06Pages({GameID:[13,11],SortType:2},async params=>{
      const offset=(params.PageID-1)*50;
      return page(Array.from({length:Math.max(0,Math.min(50,total-offset))},(_,i)=>String(offset+i)),total);
    });
    assert.equal(result.DataList.reduce((n,g)=>n+g.Master.length,0),total);
  }
  const first=page(['same-id'],2), second={TotalCnt:2,DataList:[{GameID:11,GameName:'六合',PhasesName:'S601',Master:[{ID:'same-id',Detail:[]}]}]};
  // The site can return smaller pages; this malformed short first page must not claim completeness.
  await assert.rejects(c.collectA06Pages({},async()=>first));
  const multi={TotalCnt:2,DataList:[...first.DataList,...second.DataList]};
  const result=await c.collectA06Pages({},async()=>multi);
  assert.deepEqual(Array.from(result.DataList,g=>g.GameName),['539','六合']);
});

test('A06 缺頁、重複ID、總筆數改變、非法回應與請求失敗不能冒充完整結果',async()=>{
  const c=vm.createContext({});vm.runInContext(collectSource(),c);
  const first=page(Array.from({length:50},(_,i)=>String(i)),51);
  for(const last of [page([],51),page(['0'],51),page(['50'],52),{TotalCnt:51,DataList:null}]){
    await assert.rejects(c.collectA06Pages({},async p=>p.PageID===1?first:last));
  }
  await assert.rejects(c.collectA06Pages({},async()=>{throw new Error('read failed')}),/read failed/);
});

function reader(query,hostname='w3.188hot.net'){
  const rendered=[],messages=[],calls=[];let unblocks=0,now=100000;
  const manager={AddAjax(path,options){calls.push(options.params);return query(options);}};
  const original=manager.AddAjax;
  const c=vm.createContext({location:{hostname,pathname:'/prefix/Front/A/A06',href:`https://${hostname}/prefix/Front/A/A06`},document:{documentElement:{dataset:{}}},
    Date:class extends Date { constructor(value){super(value === undefined ? now : value);}static now(){return now;} },window:{frameElement:{name:'sync-detail-frame'},$AjaxManage:manager,postMessage:m=>messages.push(m)},
    AbortController,setTimeout,clearTimeout,URL});
  c.window.Mo={NowAPIPath:'/FrontA060',GetQuery(){manager.AddAjax('/FrontA060/OrderQuery',{
    params:{GameID:[13],SortType:2,PageID:2},success:r=>rendered.push(r),complete:()=>unblocks++});}};
  c.withPageRequestTimeout=async task=>{
    const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),15);
    try{return await task(ac.signal);}finally{clearTimeout(timer);}
  };
  vm.runInContext(`let a06Busy=false,a06NextRead=0,a06NativeReads=0,a06OwnedQuery=false,a06OwnedXHR=null,packageBusy=false,currentA06Proof=null;${collectSource()}${extract('readFullA06')}`,c);
  class XHR{
    listeners=new Map();
    open(){} setRequestHeader(){} send(){}
    addEventListener(name,fn){this.listeners.set(name,fn);}
    emit(name){this.listeners.get(name)?.();}
    abort(){this.aborted=true;this.emit('loadend');}
  }
  c.XMLHttpRequest=XHR;c.publish=()=>{};
  vm.runInContext(hook.slice(hook.indexOf('  const open = XMLHttpRequest.prototype.open'),hook.indexOf('  window.addEventListener("message", async')),c);
  c.makeXHR=()=>{const xhr=new XHR();xhr.open('POST','/prefix/api/FrontA060/OrderQuery');xhr.send();return xhr;};
  return {c,manager,original,calls,rendered,messages,unblocks:()=>unblocks,advance:()=>now+=16000};
}

test('A06 私有框架完整讀取後才交給原生 renderer，保留頁面原金額；前景及未支援來源不查詢',async()=>{
  for(const host of ['w.188hot.net','w.hyp98.com','w.bnd139.com','w.umh693.com','w.and539.com','w.pee688.com','w.amc283.com','w.cj3688.com']){
    const r=reader(o=>{const p=page(o.params.PageID===1?Array.from({length:50},(_,i)=>String(i)):['50'],51);p.DataList[0].TotBet=o.params.PageID===1?123:456;queueMicrotask(()=>o.success(p));},host);
    await r.c.readFullA06();assert.equal(r.rendered.length,1);assert.equal(r.unblocks(),1);
    assert.deepEqual(r.calls.map(p=>p.PageID),[1,2]);assert.equal(r.manager.AddAjax,r.original);
    assert.deepEqual(Array.from(r.rendered[0].DataList,g=>g.TotBet),[123,456]);
    assert.equal(r.c.document.documentElement.dataset.syncA06ReadingAt,undefined);
  }
  for(const mode of ['foreground','unknown']){
    const r=reader(()=>{throw new Error('must not call')},mode==='unknown'?'other.example':'w.188hot.net');
    if(mode==='foreground')r.c.window.frameElement.name='mainFrame';
    await r.c.readFullA06();assert.equal(r.calls.length,0);assert.equal(r.rendered.length,0);
  }
});

test('A06 中途失敗不渲染部分結果，恢復鎖且診斷無網址或明細',async()=>{
  let failed=true;
  const r=reader(o=>queueMicrotask(()=>failed?o.error():o.success(page(['ok']))));
  await r.c.readFullA06();assert.equal(r.rendered.length,0);assert.equal(r.manager.AddAjax,r.original);
  assert.deepEqual(JSON.parse(JSON.stringify(r.messages[0])),{type:'SYNC_DIAGNOSTIC_EVENT',event:{stage:'read',code:'READ_FAILED'}});
  failed=false;r.advance();await r.c.readFullA06();assert.equal(r.rendered.length,1);
});

test('A06 timeout 中止並可重試；舊 success 晚到不能渲染或覆蓋新結果',async()=>{
  let old,aborts=0,slow=true;
  const r=reader(o=>{if(slow){old=o;return {abort(){aborts++;}};}queueMicrotask(()=>o.success(page(['new'])));});
  await r.c.readFullA06();assert.equal(aborts,1);assert.equal(r.rendered.length,0);
  assert.equal(r.c.document.documentElement.dataset.syncA06ReadingAt,undefined);
  slow=false;r.advance();await r.c.readFullA06();old.success(page(['old']));
  assert.equal(r.rendered.length,1);assert.equal(r.rendered[0].DataList[0].Master[0].ID,'new');
});

test('原生 AddAjax 不回傳 handle 時仍能中止底層 XHR，timeout 不留下 native busy',async()=>{
  let old,xhr,slow=true;
  const r=reader(o=>{if(slow){old=o;xhr=r.c.makeXHR();return undefined;}queueMicrotask(()=>o.success(page(['new'])));});
  await r.c.readFullA06();assert.equal(xhr.aborted,true);assert.equal(r.rendered.length,0);
  slow=false;r.advance();await r.c.readFullA06();old.success(page(['old']));
  assert.equal(r.rendered.length,1);assert.equal(r.rendered[0].DataList[0].Master[0].ID,'new');
});

test('原生初始明細仍請求中不重疊；loadend 後完整補读正常恢復',async()=>{
  const r=reader(o=>queueMicrotask(()=>o.success(page(['ok']))));
  const xhr=r.c.makeXHR();await r.c.readFullA06();assert.equal(r.calls.length,0);
  xhr.emit('loadend');await r.c.readFullA06();assert.equal(r.rendered.length,1);
});

test('A06 只有原生全部盤口且完整成功才能提交空清單；筛选页不提交替換',async()=>{
  for(const value of [0,'0',13]){
    const r=reader(o=>queueMicrotask(()=>o.success({TotalCnt:0,DataList:[]})));
    r.c.window.XI={Utils:{NowMenuValue:()=>value,NowMenuAllValue:[13]}};
    await r.c.readFullA06();
    const proof=r.messages.find(m=>m.type==='SYNC_CURRENT_A06');
    if(value===13)assert.equal(proof,undefined);else{assert.equal(proof.proof.total,0);assert.equal(proof.proof.items.length,0);}
  }
});

test('風雲／喜 Gateway 完整回應超過50批仍全數解析，不套用 A06 的畫面分頁',async()=>{
  const source=await readFile(new URL('src/content/parsers-gateway.js',root),'utf8');
  for(const domain of ['vs968.net','kd998.net']){
    const c={location:{hostname:`www.${domain}`},rootDomain:()=>domain,HOST_NAMES:{},SITE_NAMES:{},kdCarUnits:{正碼:3800},
      isExplicitTrue:v=>v===true||v===1||v==='1',enrichedBet:(a,b)=>({...a,...b})};
    vm.runInNewContext(source,c);
    const rows=Array.from({length:123},(_,i)=>({id:i+1,casino:0,bet_type:1,created_at:'2026-10-12 20:00:00',
      game:{seq:'C115247',casinoLabel:'539'},group:{id:7,no:1},details:[{id:1,play:1,content:'01',money:3800,water:0,odds:71}]}));
    const bets=c.scrapeVs968Json(JSON.stringify({total:123,rows}));
    assert.equal(bets.length,123);assert.equal(new Set(bets.map(b=>b.id)).size,123);
    assert.deepEqual(Array.from(bets,b=>b.betAmount),Array(123).fill(3800));
  }
});
