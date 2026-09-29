import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const loadStart=html.indexOf('async function load(){');
const loadSource=html.slice(loadStart,html.indexOf('\ndraw=function()',loadStart));

async function dashboardWith(payload){
  const label={textContent:''},panel={classList:{add(){},remove(){} }};
  const context=vm.createContext({
    Date,loadBusy:false,authToken:'',IS_LOCAL_PREVIEW:true,API:'',
    fetchBetPayload:async()=>({response:{status:200},payload}),
    $:selector=>selector==='#sync'?panel:label,
    reconciledCache:{},bets:[],collapseWindNumberBatches:x=>x,suppressKdLegacyRows:x=>x,dedupeExactBets:x=>x,
    orderSignature:rows=>JSON.stringify(rows),renderSignature:'',draw(){},
  });
  vm.runInContext(`${loadSource};globalThis.load=load;globalThis.rows=()=>bets`,context);
  await context.load();
  return {label,context};
}

test('M07 local dashboard keeps stale bets visible but does not claim current sync',async()=>{
  const old={id:'old',event:'正碼',selection:'01'};
  const {label,context}=await dashboardWith({bets:[old],freshness:'stale',lastSuccessAt:'2026-09-29T01:00:00.000Z',lastErrorCode:'REMOTE_FETCH_FAILED'});
  assert.equal(context.rows().length,1);
  assert.match(label.textContent,/舊資料|未更新|更新失敗/);
  assert.doesNotMatch(label.textContent,/本機同步中/);
});

test('M07 waiting cache with failed refresh does not display online',async()=>{
  const {label}=await dashboardWith({bets:[],waiting:true,freshness:'stale',lastErrorCode:'REMOTE_FETCH_FAILED'});
  assert.match(label.textContent,/更新失敗/);
});
