import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../RuntimeData/同步器擴充功能/src/content/parsers-dom.js', import.meta.url), 'utf8');
const batches = [
  ['20:54:41', [['49',200,2],['68',300,3],['94',200,2]],700],
  ['20:09:53', ['00','20','27','30','67','72','76','77','79','98'].map(n=>[n,300,3]),3000],
  ['20:02:53', [['00',300,3],['05',200,2],['14',300,3],['40',300,3],['50',200,2]],1300],
  ['20:00:44', [['36',100,1]],100],
  ['19:54:44', ['49','54','87','94','99'].map(n=>[n,200,2]),1000],
  ['18:12:09', [['02',500,5],['36',500,5]],1000],
];

test('風雲實際六批六合台號保留下注金額，不再次乘支數', () => {
  const groups = batches.map(([time, rows], i) => {
    const item = { time, number: String(6-i), querySelectorAll: () => rows.map(([number, amount, count]) => ({
      values: { '.col-play':'台號', '.col-content':number, '.col-money':String(amount), '.col-unit':`${count} 支`, '.col-total':'0' },
      textContent: `台號 ${number} 下注金額 ${amount} 支數 ${count}`,
    })) };
    return { querySelectorAll: () => [item] };
  });
  const context = {
    document: { querySelector:()=>({}), querySelectorAll:()=>groups },
    location: { hostname:'www.vs968.net' },
    rootDomain:()=> 'vs968.net', HOST_NAMES:{}, SITE_NAMES:{'vs968.net':'風雲'},
    text:(node, selector)=>selector === '.panel_title span' ? '六合 / S595-001' :
      selector === '.bet_item_no' ? node.number : selector === '.bet_cnt > p.btm--gold' ? '2026-09-12' :
      selector === '.bet_time' ? node.time : node.values?.[selector] || '',
    numeric:value=>Number(String(value).replace(/[^0-9.-]/g,'')),
    enrichedBet:(base, extra)=>({...base,...extra}), exactItemNumber:value=>value,
    orderStatusFromText:()=> '待結算',
  };
  vm.runInNewContext(source, context);
  const bets = context.scrape();
  assert.equal(bets.reduce((sum,b)=>sum+b.betAmount,0),7100);
  batches.forEach(([time, details, expected])=>{
    const rows = bets.filter(b=>b.placedAt.includes(time));
    assert.equal(rows.reduce((sum,b)=>sum+b.betAmount,0),expected);
    assert.deepEqual(Array.from(rows,b=>[b.selection,b.betAmount,b.carCount]),details.map(([n,a,c])=>[`台號 ${n}`,a,c]));
  });
});
