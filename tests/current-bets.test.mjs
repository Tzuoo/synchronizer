import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const source=await readFile(new URL('../current-bets.js',import.meta.url),'utf8').catch(()=> '');
test('完整來源現在有／沒有／空清單：依來源ID，不按日期；不同站不影響',()=>{
  assert.ok(source,'current display contract missing');const c={};vm.runInNewContext(source,c);
  const site='aaaaaaaa|188hot.net', id=site+'|you320|one';
  const rows=[{id,source:'16',placedAt:'2026-10-12'}, {id:site+'|you320|old',source:'16'}, {id:'bbbbbbbb|hyp98.com|a6539|one',source:'98'}, {id:'legacy-unknown-id',source:'16'}];
  const list={complete:true,scope:'all',clientSite:site,account:'you320',capturedAt:'2026-10-14T12:00:00.000Z',lastSeen:'2026-10-14T12:00:00.000Z',ids:[id]};
  assert.deepEqual(Array.from(c.filterCurrentBets(rows,[list]),r=>r.id),[id,rows[2].id]);
  assert.deepEqual(Array.from(c.filterCurrentBets(rows,[{...list,ids:[]}]),r=>r.id),[rows[2].id]);
  for(const bad of [{...list,complete:false},{...list,scope:'page'},{...list,ids:null},{...list,ids:['wrong']}])assert.equal(c.filterCurrentBets(rows,[bad]).length,4);
});
test('空的家裡清單不被公司舊資料復活；已一對一配對的正確 DOM名稱／金額保留',()=>{
  assert.ok(source);const c={};vm.runInNewContext(source,c);
  const home='aaaaaaaa|kd998.net',company='bbbbbbbb|kd998.net',gateway=home+'|a0593|kd-gateway-batch|1';
  const rows=[{id:home+'|a0593|dom',ids:[home+'|a0593|dom',gateway],playType:'二星連碰',betAmount:1000}, {id:company+'|a0593|old'}];
  const list={complete:true,scope:'all',clientSite:home,account:'a0593',capturedAt:'2026-10-14T12:00:00.000Z',lastSeen:'2026-10-14T12:00:00.000Z',ids:[gateway]};
  const live=c.filterCurrentBets(rows,[list]);assert.equal(live.length,1);assert.equal(live[0].playType,'二星連碰');assert.equal(live[0].betAmount,1000);
  assert.equal(c.filterCurrentBets(rows,[{...list,ids:[]}]).length,0);
});
test('同顯示名稱不同來源域名不互相撤回：航海 pee 空不影響 amc',()=>{
  const c={};vm.runInNewContext(source,c);
  const rows=[{id:'aaaaaaaa|pee688.com|a0593|one',source:'航海'}, {id:'bbbbbbbb|amc283.com|a0593|one',source:'航海'}, {id:'w1.amc283.com|legacy|one',source:'航海'}];
  const list={complete:true,scope:'all',clientSite:'aaaaaaaa|pee688.com',account:'a0593',capturedAt:'2026-10-14T12:00:00.000Z',lastSeen:'2026-10-14T12:00:00.000Z',ids:[]};
  assert.deepEqual(Array.from(c.filterCurrentBets(rows,[list]),r=>r.id),rows.slice(1).map(r=>r.id));
});

const sync=await readFile(new URL('../../RuntimeData/同步器擴充功能/src/content/sync.js',import.meta.url),'utf8');
const background=await readFile(new URL('../../RuntimeData/同步器擴充功能/background.js',import.meta.url),'utf8');
const hook=await readFile(new URL('../../RuntimeData/同步器擴充功能/page-hook.js',import.meta.url),'utf8');
test('Gateway 成功完整空回應可提交；筛选、失敗、缺列、重复来源ID不提交',()=>{
  const sent=[],c={URL,location:{hostname:'www2.kd998.net',href:'https://www2.kd998.net/new_web/'},document:{querySelector:()=>({__vue__:{$store:{getters:{member:{account:'a0593'}}}}})},window:{postMessage:m=>sent.push(m)},rejectOversizedObservedResponse:()=>false};
  vm.runInNewContext(`let lastRequest,lastDetailResponse;${hook.slice(hook.indexOf('  const publish ='),hook.indexOf('  const PASSIVE_OBSERVATION_TIMEOUT_MS'))};this.publish=publish`,c);
  const all='https://www2.kd998.net/pub/SuperGateway.php?game_id=0&group_id=0&sort=time-desc';
  c.publish(all,'GET','','',JSON.stringify({status:true,total:0,rows:[]}));assert.equal(sent.at(-1).currentProof.total,0);assert.equal(sent.at(-1).currentProof.account,'a0593');
  for(const data of [{status:false,total:0,rows:[]},{status:true,total:1,rows:[]},{status:true,total:2,rows:[{id:1,details:[]},{id:1,details:[]}]}]){
    c.publish(all,'GET','','',JSON.stringify(data));assert.equal(sent.at(-1).currentProof,undefined);
  }
  c.publish(all.replace('game_id=0','game_id=1'),'GET','','',JSON.stringify({status:true,total:0,rows:[]}));assert.equal(sent.at(-1).currentProof,undefined);
});
test('來源完整空清單會發出替換訊息；不完整、漏解析、多盤口碰撞保留原資料',()=>{
  const sent=[],c={document:{querySelectorAll:()=>[]},reportActualAccount:()=> 'you320',preserveWebsiteOrder:x=>x,safeMessage:m=>sent.push(m)};
  vm.runInNewContext(sync.slice(0,sync.indexOf("window.addEventListener('message'")),c);
  const proof={complete:true,scope:'all',capturedAt:'2026-10-14T12:00:00.000Z',total:0,items:[]};
  assert.equal(c.sendCurrentBets([],proof,'a06'),true);assert.equal(sent[0].type,'SYNC_CURRENT_BETS');assert.equal(sent[0].bets.length,0);
  for(const p of [{...proof,complete:false},{...proof,scope:'page'},{...proof,total:1,items:[{game:'539',item:'1'}]}])assert.equal(c.sendCurrentBets([],p,'a06'),false);
  const bet={id:'host|one',event:'539 / 全車單碰',itemNumber:'1',placedAt:'2026-10-12T20:00:00+08:00',parseStatus:'parsed'};
  assert.equal(c.sendCurrentBets([bet],{...proof,total:1,items:[{game:'539',item:'1'}]},'a06'),true,'source still lists a cross-day bet');
  assert.equal(c.sendCurrentBets([{...bet,parseStatus:'partial'}],{...proof,total:1,items:[{game:'539',item:'1'}]},'a06'),false);
});

test('500分批全部成功才提交当前清單，第二批失敗不提交；空清單也提交',async()=>{
  const c={};
  const batches=background.slice(background.indexOf('async function uploadBetBatches('),background.indexOf('async function getInstallationId('));
  const complete=background.slice(background.indexOf('async function uploadCurrentBets('),background.indexOf('chrome.runtime.onMessage.addListener('));
  vm.runInNewContext(batches+complete,c);const requests=[];let fail=false,current=null;
  c.DASHBOARD='https://isolated.test';
  c.fetchJsonWithTimeout=async(url,init)=>{if(init.method!=='POST')return{response:{ok:true},payload:{protocol:1}};const body=JSON.parse(init.body);requests.push({url,body});if(url.endsWith('/current')){current=body;return{response:{ok:true},payload:{ok:true}};}return{response:{ok:!(fail&&body.bets.length===1),status:503},payload:{error:'failed'}};};
  const bets=Array.from({length:501},(_,i)=>({id:'id'+i})),client={site:'aaaaaaaa|188hot.net'};
  fail=true;assert.equal((await c.uploadCurrentBets(bets,client,'you320','2026-10-14T12:00:00.000Z','synthetic')).ok,false);assert.equal(current,null);
  fail=false;requests.length=0;assert.equal((await c.uploadCurrentBets(bets,client,'you320','2026-10-14T12:01:00.000Z','synthetic')).ok,true);
  assert.deepEqual(requests.slice(0,2).map(r=>r.body.bets.length),[500,1]);assert.equal(current.ids.length,501);
  await c.uploadCurrentBets([],client,'you320','2026-10-14T12:02:00.000Z','synthetic');assert.equal(current.ids.length,0);
  let writes=0;c.fetchJsonWithTimeout=async(url,init)=>{if(init.method==='POST')writes++;return{response:{ok:false,status:404},payload:{}}};
  assert.equal((await c.uploadCurrentBets(bets,client,'you320','2026-10-14T12:03:00.000Z','synthetic')).unsupported,true);assert.equal(writes,0,'unpublished backend must not be mutated');
});

test('中獎只讀網站明示 subtotal 欄位，保留原金額精度、ID與撤單；無欄位不猜',()=>{
  const cell=(text,colSpan=1)=>({textContent:text,colSpan});const header={cells:['項次','玩法','下注金額','中獎','小計'].map(x=>cell(x))};
  const summary={textContent:'單項金額總計',cells:[cell('單項金額總計',2),cell('1000'),cell('2,119.98'),cell('0')]};
  const table={rows:[header,{cells:[cell('1'),cell('全車')]},summary],innerText:'1 全車 2026-10-14\n20:00:00'};
  const c={document:{querySelectorAll:()=>[table]}};vm.runInNewContext(sync.slice(0,sync.indexOf('function sendCurrentBets(')),c);
  const bet={id:'id',itemNumber:'1',placedAt:'2026-10-14T20:00:00+08:00',status:'待結算',result:null};
  const win=c.withCurrentWinningAmounts([bet])[0];assert.equal(win.result,2119.98);assert.equal(win.status,'已中獎');assert.equal(win.id,'id');
  assert.equal(c.withCurrentWinningAmounts([{...bet,status:'已撤單'}])[0].status,'已撤單');
  c.document.querySelectorAll=()=>[];assert.equal(c.withCurrentWinningAmounts([bet])[0].result,null);
});

test('套餐只接受此完整來源批次的補讀內容；不同日期／盤口不可覆蓋',()=>{
  const expanded={id:'pee688.com|package|a0593|master',itemNumber:'8',event:'539 / 三星套餐',placedAt:'2026-10-14T20:00:00+08:00',parseStatus:'parsed'};
  const c={currentAmcPackages:new Map([['master',expanded]])};
  vm.runInNewContext(sync.slice(sync.indexOf('function withCurrentAmcPackages('),sync.indexOf("window.addEventListener('message'")),c);
  const partial={itemNumber:'8',event:'539 / 三星套餐',parseStatus:'partial'},proof={items:[{id:'master',item:'8',game:'539',placedAt:'2026-10-14 20:00:00'}]};
  assert.equal(c.withCurrentAmcPackages([partial],proof)[0],expanded);
  for(const item of [{...proof.items[0],placedAt:'2026-10-13 20:00:00'},{...proof.items[0],game:'六合'},{...proof.items[0],id:'other'}])assert.equal(c.withCurrentAmcPackages([partial],{items:[item]})[0],partial);
  c.currentAmcPackages.clear();assert.equal(c.withCurrentAmcPackages([partial],proof)[0],partial);
});
