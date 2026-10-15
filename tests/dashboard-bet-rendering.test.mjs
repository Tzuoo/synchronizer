import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const membership=await readFile(new URL('../current-bets.js',import.meta.url),'utf8');
const fn=name=>{const text=html.split(/\r?\n/).find(line=>line.startsWith(`function ${name}(`));assert.ok(text,name);return text};
const rows=[10000,20000,30000,40000,20000,8600].map((amount,i)=>({
  id:`bbbbbbbb|188hot.net|fixture|${i}`,ids:[`bbbbbbbb|188hot.net|fixture|${i}`],source:'16',account:'fixture',
  placedAt:'2026-10-15T19:00:00+08:00',event:'539 / 二星連碰',playType:'二星連碰',selection:`fixture-${i}`,
  displayEvent:'二星連碰',displaySelection:`fixture-${i}`,betAmount:amount,amountLabel:'$100',totalLabel:`$${amount}`,countLabel:'1碰',itemNumber:i+1
}));
function page(initial=rows){
  const elements=new Map();const $=key=>{if(!elements.has(key))elements.set(key,{value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){}}});return elements.get(key)};
  const c={Date,Intl,encodeURIComponent,JSON,$,site:'全部網站',names:['16','98'],bets:initial,IS_LOCAL_PREVIEW:false,authToken:'fixture',API:'https://isolated.invalid/api/bets',authHeaders:()=>({}),loadBusy:false,reconciledCache:{},renderSignature:null,
    fetchBetPayload:async()=>({response:{status:200},payload:{bets:initial}}),
    collapseWindNumberBatches:x=>x,suppressKdLegacyRows:x=>x,dedupeExactBets:x=>x,
    displayBets:()=>c.bets,
    money:n=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(Number(n)||0)};
  vm.createContext(c);
  const draw=html.split(/\r?\n/).find(line=>line.startsWith('draw=function()'));
  const start=html.indexOf('async function load(){'),load=html.slice(start,html.indexOf('\ndraw=function()',start));
  const signature=html.match(/function orderSignature\(rows\)\{[\s\S]*?(?=function betTotal)/)?.[0];assert.ok(signature);
  vm.runInContext([membership,...['escapeHtml','gameColorClass','gameSectionOf','orderByGameSection','renderBetRows','getBetAmount'].map(fn),signature,draw,load].join('\n'),c);
  return{c,$};
}
test('非空明細確實渲染六列，不會只更新總額／筆數後留下空表格',()=>{
  const {c,$}=page();c.draw();assert.equal($('#count').textContent,'共 6 筆');assert.match($('#total').textContent,/128,600/);
  assert.equal(($('#rows').innerHTML.match(/class="item-cell"/g)||[]).length,6);assert.match($('#rows').innerHTML,/fixture-5/);
});
test('篩選至一筆仍顯示該筆內容，撤單與底層對帳 ID 保留',()=>{
  const row={...rows[0],deleted:true,reconciled:true,ids:[rows[0].id,'legacy-fixture-id']};const {c,$}=page([row,...rows.slice(1)]);$('#query').value='fixture-0';c.draw();
  assert.equal($('#count').textContent,'共 1 筆');const rendered=$('#rows').innerHTML;assert.match(rendered,/fixture-0/);assert.match(rendered,/已刪單/);assert.match(rendered,/已對帳/);
  assert.ok(rendered.includes(encodeURIComponent(JSON.stringify(row.ids))));
});
test('完整空清單後出現新下注，輪詢須自然渲染明細',async()=>{
  const {c,$}=page([]);await c.load();assert.match($('#rows').innerHTML,/尚無資料/);
  c.fetchBetPayload=async()=>({response:{status:200},payload:{bets:rows}});await c.load();assert.equal($('#count').textContent,'共 6 筆');assert.match($('#rows').innerHTML,/fixture-5/);assert.equal($('#sync b').textContent,'同步中');
});
test('中獎標籤僅顯示明示正數；未提供、零與非法值不推算中獎',()=>{
  const {c}=page();for(const result of [undefined,null,0,'',NaN,Infinity,'not-a-number',-1])assert.doesNotMatch(c.renderBetRows([{...rows[0],result}]),/中獎/);
  const win={...rows[0],result:2119.98};assert.match(c.renderBetRows([win]),/中獎/);assert.equal(win.result,2119.98);
});
test('渲染失敗不可先提交 signature，同一份資料下次輪詢必須可重試',async()=>{
  const {c,$}=page();let attempts=0;c.draw=()=>{if(++attempts===1)throw Error('isolated render failure')};await c.load();assert.equal($('#sync b').textContent,'連線失敗');
  await c.load();assert.equal(attempts,2);assert.equal($('#sync b').textContent,'同步中');
});
