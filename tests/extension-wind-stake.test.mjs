import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../RuntimeData/同步器擴充功能/src/content/parsers-dom.js', import.meta.url), 'utf8');
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

test('風雲實站四星連碰讀取每碰200與5碰，保留原 selection 以維持舊 ID', async () => {
  const rawContent = 'visibility visibility_off 05, 23, 25, 36, 37   點此查看下注內容   顯示當時固定賠';
  const header = { children: ['玩法','內容','賠率','本金','每碰金額','碰數','下注金額','退水漲跌','退水金額','小計'].map(textContent=>({textContent})) };
  const row = { values: { '.col-play':'四星連碰', '.col-content':rawContent, '.col-money':'1000', '.col-unit':'', '.col-total':'487' }, textContent:'四星連碰 05, 23, 25, 36, 37', children:['四星連碰',rawContent,'8000','47.50','200','5','1000','-12','513','487'].map(textContent=>({textContent})), closest:()=>({querySelector:()=>header}) };
  const item = { number:'1', time:'19:28:49', querySelectorAll:()=>[row] };
  const context = {
    document:{ querySelector:()=>({}), querySelectorAll:()=>[{ querySelectorAll:()=>[item] }] },
    location:{ hostname:'www.vs968.net' }, rootDomain:()=> 'vs968.net', HOST_NAMES:{}, SITE_NAMES:{'vs968.net':'風雲'},
    text:(node, selector)=>selector === '.panel_title span' ? '539 / 四星連碰' : selector === '.bet_item_no' ? node.number : selector === '.bet_cnt > p.btm--gold' ? '2026-10-02' : selector === '.bet_time' ? node.time : node.values?.[selector] || '',
    numeric:value=>Number(String(value).replace(/[^0-9.-]/g,'')), enrichedBet:(base, extra)=>({...base,...extra}), exactItemNumber:value=>value,
    orderStatusFromText:()=> '待結算', closestText:node=>node.textContent,
  };
  vm.runInNewContext(source, context);
  const [bet] = context.scrape();
  assert.equal(bet.playType, '四星連碰');
  assert.equal(bet.selection, `四星連碰 ${rawContent}`);
  assert.equal(bet.betAmount, 1000);
  assert.equal(bet.unitAmount, 200);
  assert.equal(bet.combinationCount, 5);
  const background = await readFile(new URL('../../RuntimeData/同步器擴充功能/background.js', import.meta.url), 'utf8');
  vm.runInNewContext(background.match(/function stableBetTail[\s\S]*?(?=\nlet installationIdPromise)/)[0], context);
  assert.equal(context.stableBetTail(bet, 'original', 0), context.stableBetTail({...bet, selection:`四星連碰 ${rawContent}`, unitAmount:1000, combinationCount:null}, 'original', 0));
});
