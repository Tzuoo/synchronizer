import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const root = new URL('../../RuntimeData/同步器擴充功能/', import.meta.url);
const parser = await readFile(new URL('src/content/parsers-amc.js', root), 'utf8');
const hook = await readFile(new URL('page-hook.js', root), 'utf8');
const main = '01,02,03,04,05,06,07,08,10,11\n12,13,14,15,16,17,18,20,21,22\n23,24,25,26,27,28,30,31,32,33\n34,35,36,37,38';
const sample = () => ({id:'sample-id',itemNumber:'1',date:'2026-09-07\n19:48:05',
  playType:'三星 套餐-9尾-連柱碰 2380-公版',gameText:'【539】 第 C115217 期',
  unitAmount:10,combinationCount:2380,betAmount:23800,deleted:false,
  parts:[{name:'三星',selection:`< 連柱碰 >\n${main} 碰\n09,19,29,39`,amount:23800}]});
function scope() {
  const ctx = {location:{hostname:'w1.pee688.com'},rootDomain:()=> 'pee688.com',
    window:{addEventListener(){}},reportActualAccount:()=> 'test-account',
    gameSectionFromText:s=>s.includes('【539】')?'539':'',
    eventWithGameSection:(g,p)=>`${g} / ${p}`,enrichedBet:(b,e)=>({...b,...e})};
  vm.runInNewContext(parser,ctx);return ctx;
}
test('航海套餐保留原名項次完整兩組及網站金額；重讀 ID 穩定',()=>{
  const c=scope(), d=sample(), b=c.parseAmcPackage(d);
  assert.equal(b.playType,d.playType);assert.equal(b.itemNumber,'1');
  assert.ok(b.selection.includes(main));assert.ok(b.selection.endsWith('09,19,29,39'));
  assert.equal(b.unitAmount,10);assert.equal(b.combinationCount,2380);assert.equal(b.betAmount,23800);
  assert.equal(b.id,c.parseAmcPackage(d).id);
  assert.notEqual(b.id,c.parseAmcPackage({...d,id:'other-id'}).id);
  assert.equal(c.parseAmcPackage({...d,deleted:true}).status,'已刪單');
  for(const patch of [{parts:[]},{betAmount:1},{gameText:''},{date:''},{itemNumber:'x'}])
    assert.equal(c.parseAmcPackage({...d,...patch}),null);
});

test('航海套餐從同源 gmenu 讀實際帳號，缺值或其他來源不猜測',()=>{
  const c=scope();
  c.reportActualAccount=()=>'';
  c.location.origin='http://w1.pee688.com';
  c.accountFromDocument=d=>d.account||'';
  const menuWindow={location:{origin:c.location.origin,pathname:'/session/Front/Shared/Menu'},document:{account:'menu-account'}};
  c.window.top={document:{querySelector:s=>{
    assert.equal(s,'frame#gmenu[name="gmenu"]');return {contentWindow:menuWindow};
  }}};
  assert.equal(c.parseAmcPackage(sample()).account,'menu-account');
  menuWindow.document.account='';
  assert.equal(c.parseAmcPackage(sample()),null);
  menuWindow.document.account='other';menuWindow.location.origin='https://other.example';
  assert.equal(c.parseAmcPackage(sample()),null);
  menuWindow.location.origin=c.location.origin;menuWindow.location.pathname='/other';
  assert.equal(c.parseAmcPackage(sample()),null);
});
test('套餐背景讀取只呼叫已確認唯讀 API，不操作視窗或刪單',async()=>{
  const timers=[],messages=[],calls=[];
  let now = 100000;
  let ready = false;
  const master={ID:'sample-id',RowID:1,ItemID:63,GroupID:106,GameID:13,GroupName:'三星',
    ItemName:'套餐-9尾-連柱碰 2380-公版',Detail:[{}],IsDelete:false};
  const table={innerText:'三星 套餐\n2026-09-07\n19:48:05\n詳細內容 23800'};
  const cell={isConnected:true,closest:()=>table};
  const xhr=function(){};xhr.prototype={open(){},send(){},setRequestHeader(){}};
  const ctx={location:{hostname:'w1.pee688.com',pathname:'/prefix/Front/A/A06'},
    Date:{now:()=>now},
    document:{documentElement:{dataset:{}},body:{innerText:'【539】 第 C115217 期\n'+table.innerText},
      querySelectorAll:()=>ready?[cell]:[],createElement:()=>({set innerHTML(x){this.textContent=x;}})},
    XMLHttpRequest:xhr,setInterval:(f,ms)=>timers.push({f,ms}),setTimeout,clearTimeout,URL,Headers};
  ctx.window={addEventListener(){},postMessage:x=>messages.push(x),fetch(){},
    ko:{contextFor:()=>({$parent:master,$data:{OrderData:'',Bet:10,TotCnt:2380,TotBet:23800}})},
    XI:{WinNOData:{GetOrderData:()=>sample().parts[0].selection}},
    $AjaxManage:{AddAjax:(url,opts)=>{calls.push([url,opts.params]);opts.success({TotalCnt:1,
      OrderList:[{GroupName:'三星',GroupID:106,OrderData:'sample',TotBet:23800}]});}}};
  vm.runInNewContext(hook,ctx);
  assert.equal(timers[0].ms,1000);
  await timers[0].f();assert.equal(calls.length,0);
  ready=true;now+=1000;
  await timers[0].f();await timers[0].f();
  assert.equal(calls.length,1); // No repeated requests during cooldown.
  now+=15000;await timers[0].f();
  assert.equal(calls.length,2);assert.equal(calls[0][0],'/FrontA060/OrderContentQuery');
  assert.equal(calls[0][1].ID,'sample-id');assert.equal(calls[0][1].IsShowWin,false);
  const packets=messages.filter(m=>m.type==='SYNC_AMC_PACKAGE');
  assert.equal(packets.length,2);assert.equal(packets[0].package.id,'sample-id');
  assert.ok(packets[0].package.parts[0].selection.includes(main));
});

test('背景重載等待套餐查詢，逾時恢復；其他網站不受影響',async()=>{
  const source=await readFile(new URL('src/content/frames.js',root),'utf8');
  const start=source.indexOf('function refreshBackgroundDetails()');
  const end=source.indexOf('// Fresh-install',start);
  const frame={contentDocument:{documentElement:{dataset:{syncPackageReadingAt:'100000'}}},getAttribute:()=> 'http://w1.pee688.com/session/Front/A/A06'};
  let now=105000,domain='pee688.com';
  const c={document:{querySelector:()=>frame},ensureBackgroundDetails(){},directA06Url:()=>true,
    rootDomain:()=>domain,location:{hostname:'w1.pee688.com'},Date:{now:()=>now},URL};
  vm.runInNewContext(source.slice(start,end),c);
  c.refreshBackgroundDetails();assert.equal(frame.src,undefined);
  now=116000;c.refreshBackgroundDetails();assert.ok(frame.src.includes('_sync=116000'));
  frame.src=undefined;now=105000;domain='hyp98.com';
  c.refreshBackgroundDetails();assert.ok(frame.src.includes('_sync=105000'));
});
