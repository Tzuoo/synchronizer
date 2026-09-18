import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const source=await readFile(new URL('../../RuntimeData/同步器擴充功能/src/content/parsers-gateway.js',import.meta.url),'utf8');
test('喜完整背景明細按組還原項次，部分清單不猜編號且 ID 不變',()=>{
  const context={location:{hostname:'www2.kd998.net'},rootDomain:()=> 'kd998.net',HOST_NAMES:{},SITE_NAMES:{'kd998.net':'喜'},kdCarUnits:{正碼:3800},isExplicitTrue:v=>v===true||v===1||String(v??'').trim()==='1',enrichedBet:(a,b)=>({...a,...b})};
  vm.runInNewContext(source,context);
  const rows=[3,1,2].map(id=>({id,created_at:'2026-09-14 20:27:40',game:{seq:'F106969'},group:{id:id===3?8:7,no:1},details:[{play:1,content:'01',money:1140,water:0,odds:71}]}));
  const full=context.scrapeVs968Json(JSON.stringify({total:3,rows}));
  assert.deepEqual(Array.from(full,b=>b.itemNumber),['1','1','2']);
  const partial=context.scrapeVs968Json(JSON.stringify({total:4,rows}));
  assert.ok(partial.every(b=>b.itemNumber===null));
  assert.deepEqual(Array.from(full,b=>[b.id,b.betAmount]),Array.from(partial,b=>[b.id,b.betAmount]));
});
test('風雲完整背景六合台號清單還原來源倒序項次與支數，不改下注金額',()=>{
  const context={location:{hostname:'www.vs968.net'},rootDomain:()=> 'vs968.net',HOST_NAMES:{},SITE_NAMES:{'vs968.net':'風雲'},isExplicitTrue:v=>v===true||v===1||String(v??'').trim()==='1',enrichedBet:(a,b)=>({...a,...b})};
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

test('風雲離開明細時，大樂同一 gateway 父批次的台號仍保留分區、兩位數與支數',()=>{
  const context={location:{hostname:'www.vs968.net'},rootDomain:()=> 'vs968.net',HOST_NAMES:{},SITE_NAMES:{'vs968.net':'風雲'},isExplicitTrue:v=>v===true||v===1||String(v??'').trim()==='1',enrichedBet:(a,b)=>({...a,...b})};
  vm.runInNewContext(source,context);
  const row={id:88,casino:2,bet_type:1,created_at:'2026-09-15 18:18:13',game:{seq:'T105478'},group:{id:12,no:2},details:[
    {id:1,play:4,content:'2',money:400,odds:11.6},
    {id:2,play:4,content:'36',money:400,odds:10}
  ]};
  const bets=context.scrapeVs968Json(JSON.stringify({total:2,rows:[row]}));
  assert.deepEqual(Array.from(bets,b=>[b.event,b.playType,b.selection,b.carCount,b.itemNumber]),[
    ['大樂 / T105478 - 002','台號','02',4,null],
    ['大樂 / T105478 - 002','台號','36',4,null]
  ]);
  assert.ok(bets.every(b=>b.rawText.includes('"gatewayRowId":88')));
});

test('背景 gateway 只將明確刪單旗標標成已撤單，字串零維持正常',()=>{
  const context={location:{hostname:'www.vs968.net'},rootDomain:()=> 'vs968.net',HOST_NAMES:{},SITE_NAMES:{'vs968.net':'風雲'},isExplicitTrue:v=>v===true||v===1||String(v??'').trim()==='1',enrichedBet:(a,b)=>({...a,...b})};
  vm.runInNewContext(source,context);
  const row={id:9,casino:1,created_at:'2026-09-18 10:00:00',game:{seq:'S600'},group:{id:5,no:1},details:[{id:1,play:4,content:'49',money:100,odds:16}],is_cancel:'0'};
  const status=value=>{
    row.is_cancel=value;
    return context.scrapeVs968Json(JSON.stringify({total:1,rows:[row]}))[0].status;
  };
  assert.equal(status('0'),'待結算');
  assert.equal(status(0),'待結算');
  assert.equal(status(false),'待結算');
  assert.equal(status('1'),'已撤單');
  assert.equal(status(1),'已撤單');
  assert.equal(status(true),'已撤單');
});
