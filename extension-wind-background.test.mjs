import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const source=await readFile(new URL('../RuntimeData/同步器擴充功能/src/content/parsers-gateway.js',import.meta.url),'utf8');
test('風雲完整背景六合台號清單還原來源倒序項次與支數，不改下注金額',()=>{
  const context={location:{hostname:'www.vs968.net'},rootDomain:()=> 'vs968.net',HOST_NAMES:{},SITE_NAMES:{'vs968.net':'風雲'},enrichedBet:(a,b)=>({...a,...b})};
  vm.runInNewContext(source,context);
  const rows=[2,1].map(id=>({id,casino:1,bet_type:1,created_at:'2026-09-12 20:54:41',game:{seq:'S595'},group:{id:7,no:1},details:[{id:1,play:4,content:'49',money:id*100,odds:16.3}]}));
  const bets=context.scrapeVs968Json(JSON.stringify({total:2,rows}));
  assert.deepEqual(Array.from(bets,b=>[b.itemNumber,b.carCount,b.betAmount]),[['2',2,200],['1',1,100]]);
  const partial=context.scrapeVs968Json(JSON.stringify({total:3,rows}));
  assert.ok(partial.every(b=>b.itemNumber===null));
  for (const [input,expected] of [['0','00'],['5','05'],['2','02'],['49','49'],['00','00'],['0&5','0&5']]) {
    rows[0].details[0].content=input;
    const formatted=context.scrapeVs968Json(JSON.stringify({total:2,rows}))[0];
    assert.equal(formatted.selection,expected);
    assert.equal(formatted.id,bets[0].id);
    assert.equal(formatted.betAmount,200);
    assert.equal(formatted.carCount,2);
  }
  rows[0].bet_type=2;
  assert.equal(context.scrapeVs968Json(JSON.stringify({total:2,rows}))[0].carCount,null);
});
