import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const base = new URL('../../RuntimeData/同步器擴充功能/src/content/', import.meta.url);
const shared = await readFile(new URL('shared.js', base), 'utf8');
const a06 = await readFile(new URL('parsers-a06.js', base), 'utf8');
const dom = await readFile(new URL('parsers-dom.js', base), 'utf8');
const amc = await readFile(new URL('parsers-amc.js', base), 'utf8');
const sync = await readFile(new URL('sync.js', base), 'utf8');

// 2026-10-15 live A06 DOM: header, empty master row carrying two rowspans,
// detail rows, then summary. Only displayed fields; no session URLs or tokens.
function tableFixture(item, play, time, detailRows, summary, star = false) {
  const header = ['項次','玩法','下注內容','賠率','本金',...(star ? ['每碰金額','碰數'] : []),'下注金額','中獎','退水漲跌','退水金額','小計'];
  const cell = (value, colSpan = 1, rowSpan = 1) => ({
    tagName:'TD', innerText:String(value), textContent:String(value), colSpan, rowSpan,
    contains(other) { return this === other; },
    closest(selector) { return selector === 'tr' ? this.row : selector === 'table' ? table : null; }
  });
  const rows = [
    { cells:header.map(value => cell(value)) },
    { cells:[cell(item,1,detailRows.length+3),cell(`${play}\n2026-10-15\n${time}`,1,detailRows.length+3)] },
    ...detailRows.map(values => ({ cells:values.map(value => cell(value)) })),
    { cells:[cell('新增備註 單項金額總計',star ? 5 : 3),...summary.map(value => cell(value))] },
    { cells:[cell('備註'),cell('',header.length-3)] }
  ];
  const table = { rows, parentElement:null };
  rows.forEach((row,index) => {
    row.tagName='TR'; row.children=row.cells; row.previousElementSibling=rows[index-1];
    row.innerText=row.textContent=row.cells.map(c=>c.innerText).join('\t');
    row.closest=selector=>selector==='table'?table:null;
    row.querySelectorAll=()=>row.cells;
    row.cells.forEach(c=>c.row=row);
  });
  table.innerText=table.textContent=rows.map(r=>r.innerText).join('\n');
  return table;
}
function page(tables, games = tables.map(()=> '六合')) {
  let last='';
  const body=tables.map((t,i)=>{
    const heading=games[i]!==last?`【${games[i]}】 第 ${games[i]==='539'?'C115250':'A26122'} 期\n`:'';
    last=games[i]; return heading+t.innerText;
  }).join('\n');
  const cells=tables.flatMap(t=>t.rows.flatMap(r=>r.cells));
  return {body:{innerText:body},documentElement:{dataset:{}},querySelector:()=>null,querySelectorAll(selector) {
    if(selector==='table')return tables;
    if(selector==='td'||selector==='td,th')return cells;
    if(selector==='tr')return tables.flatMap(t=>t.rows);
    return [];
  }};
}
function scope(document = page([])) {
  const messages=[];
  const c={document,location:{hostname:'www.pee688.com'},window:{addEventListener(){}},
    chrome:{runtime:{getManifest:()=>({version:'test'})}}};
  vm.runInNewContext(shared+'\n'+dom+'\n'+a06+'\n'+amc+'\n'+sync.slice(0,sync.indexOf("window.addEventListener('message'")),c);
  c.safeMessage=m=>{messages.push(m);return Promise.resolve({ok:true});};
  c.reportActualAccount=()=> 'fixture-account'; c.preserveWebsiteOrder=rows=>rows;
  return {c,messages};
}
const special = (item,time,items) => tableFixture(item,'特碼 單碰',time,
  items.map(([number,amount,win=0])=>[`${number} 正常顯示 顯示去除`,36,73.6,amount,win,0,amount*.264,amount*.736-win]),
  [items.reduce((s,x)=>s+x[1],0),items.reduce((s,x)=>s+(x[2]||0),0),0,0,0]);
function liveAmcPage() {
  const pillars='第01柱 08,28,48\n第02柱 04,25,35\n第03柱 23,27,39\n正常顯示 顯示去除';
  const tables=[
    tableFixture(14,'三星 柱碰','21:24:19',[[pillars,570,62.4,25,27,675,0,0,253.8,421.2]],[675,0,0,253.8,421.2],true),
    tableFixture(13,'二星 柱碰','21:24:19',[[pillars,57,72.9,100,27,2700,0,0,731.7,1968.3]],[2700,0,0,731.7,1968.3],true),
    special(12,'20:37:39',[['34',500]]),
    special(11,'20:15:32',['03','10','13','16','17','20','30','36','37','39','40','49'].map(n=>[n,500,n==='20'?18000:0])),
    special(10,'20:14:42',['06','07','25','26','27','32','42','46'].map(n=>[n,n==='26'?3000:1000])),
    tableFixture(9,'特尾三 單碰','20:09:02',[
      ['478 正常顯示 顯示去除',300,60,100,0,0,40,60],['785 正常顯示 顯示去除',450,60,100,0,0,40,60]
    ],[200,0,0,80,120]),
    special(8,'20:08:51',['10','20','30','40'].map(n=>[n,100,n==='20'?3600:0])),
    special(7,'20:08:47',[['01',300],['03',100],['04',100],['11',300],['12',100],['13',1000],['14',100],['17',200],['21',2500],['30',200],['31',500],['36',100],['40',200],['41',300],['42',300],['47',300],['48',200]]),
    special(6,'20:06:33',[['20',100,3600],['27',100]]),
    special(5,'20:06:14',[['17',100],['47',200]]),
    special(4,'19:53:31',[['10',200]]),
    special(3,'19:07:45',['10','20','30','40'].map(n=>[n,300,n==='20'?10800:0])),
    special(2,'19:07:41',[['03',200],['06',300],['10',1000],['20',200,7200],['26',300],['36',300]]),
    tableFixture(1,'三星 套餐-8尾-連柱碰 2380-公版','19:05:54',[
      ['詳細內容',570,62.5,35,2380,83300,0,0,31237.5,52062.5]
    ],[83300,0,0,31237.5,52062.5],true)
  ];
  return page(tables,tables.map((_,i)=>i===13?'539':'六合'));
}

test('航海實站收合套餐不產生 placeholder，補讀必須加入同一完整清單，14批114775',()=>{
  const root=liveAmcPage(),{c,messages}=scope(root);
  const parsed=c.scrapeAmcOrders(root);
  assert.equal(parsed.length,13,'13 批非套餐必須完整解析');
  assert.deepEqual(Array.from(parsed,b=>b.itemNumber),Array.from({length:13},(_,i)=>String(14-i)));
  assert.equal(parsed.reduce((s,b)=>s+b.betAmount,0),31475);
  assert.equal(parsed.find(b=>b.itemNumber==='11').selection,'03 500、10 500、13 500、16 500、17 500、20 500、30 500、36 500、37 500、39 500、40 500、49 500');
  const expanded=c.parseAmcPackage({id:'fixture-master',itemNumber:'1',date:'2026-10-15\n19:05:54',
    playType:'三星 套餐-8尾-連柱碰 2380-公版',gameText:'【539】 第 C115250 期',unitAmount:35,combinationCount:2380,betAmount:83300,
    parts:[{name:'三星',selection:'< 連柱碰 >\n01,02,03\n碰 08,18,28,38',amount:83300}]});
  assert.ok(expanded);
  c.expanded=expanded;vm.runInNewContext("currentAmcPackages.set('fixture-master',expanded)",c);
  const proof={complete:true,scope:'all',total:14,capturedAt:'2026-10-15T14:00:00.000Z',
    items:[...parsed.map(b=>({id:'fixture-'+b.itemNumber,item:b.itemNumber,game:'六合',placedAt:b.placedAt.replace('T',' ').slice(0,19)})),
      {id:'fixture-master',item:'1',game:'539',placedAt:'2026-10-15 19:05:54'}]};
  const complete=c.withCurrentAmcPackages(parsed,proof);
  assert.equal(complete.length,14);assert.equal(complete.at(-1).id,expanded.id);
  assert.equal(complete.reduce((s,b)=>s+b.betAmount,0),114775);
  assert.equal(c.sendCurrentBets(complete,proof,'a06'),true);
  assert.equal(messages.find(m=>m.type==='SYNC_CURRENT_BETS').bets.length,14);
  assert.equal(c.sendCurrentBets(parsed,proof,'a06'),false,'套餐未補齊不得當完整或空清單');
  for(const patch of [{placedAt:'2026-10-14 19:05:54'},{game:'六合'},{id:'unrelated'}]) {
    const bad={...proof,items:[...proof.items.slice(0,-1),{...proof.items.at(-1),...patch}]};
    assert.equal(c.withCurrentAmcPackages(parsed,bad).length,13);
  }
  assert.equal(c.withCurrentAmcPackages([], {...proof,items:[]}).length,0,'舊套餐不可復活成功空清單');
});

test('航海來源號碼／下注金額不可因 UI 操作文字而移位；不完整列拒收',()=>{
  const root=page([special(11,'20:15:32',[['03',500],['20',500,18000]])]);
  const {c}=scope(root),[bet]=c.scrapeAmcOrders(root);
  assert.equal(bet.selection,'03 500、20 500');assert.equal(bet.betAmount,1000);
  assert.equal(bet.id,c.scrapeAmcOrders(root)[0].id);
  const broken=page([special(11,'20:15:32',[['03',500],['20',500,18000]])]);
  broken.body.innerText=broken.body.innerText.replace('單項金額總計\t1000','單項金額總計\t1001');
  assert.equal(c.scrapeAmcOrders(broken).length,0);
});

test('A06 中獎按 rowspan/colspan 還原實際欄位，不讀退水；零、精度與撤單保留',()=>{
  for(const [amount,win,rebate,star] of [[14250,0,3106.02,false],[4800,28500,1305.6,false],[1320,11660,374.88,true],[3840,11400,1044.48,false],[20,0,10.1,true]]) {
    const details=star?[['14,19,30,34',53,71.6,220,6,amount,win,0,rebate,0]]:[['08',5.5,72.8,amount,win,0,rebate,0]];
    const t=tableFixture(8,'全車 單碰','20:00:00',details,[amount,win,0,rebate,0],star),{c}=scope(page([t]));
    const bet={id:'existing-id',itemNumber:'8',placedAt:'2026-10-15T20:00:00+08:00',status:'已撤單',result:null};
    const result=c.withCurrentWinningAmounts([bet])[0];
    assert.equal(result.result,win);assert.equal(result.id,bet.id);assert.equal(result.status,'已撤單');
  }
});

test('A06 同日期項次歧義／缺少中獎欄／跨欄不明，不推算中獎',()=>{
  const t=special(8,'20:00:00',[['20',100,3600]]),{c}=scope(page([t,t]));
  const bet={id:'id',itemNumber:'8',placedAt:'2026-10-15T20:00:00+08:00',result:null};
  assert.equal(c.withCurrentWinningAmounts([bet])[0].result,null);
  c.document=page([t]);t.rows[0].cells=t.rows[0].cells.filter(c=>c.textContent!=='中獎');
  assert.equal(c.withCurrentWinningAmounts([bet])[0].result,null);
});

const gateway = await readFile(new URL('parsers-gateway.js', base), 'utf8');
const hook = await readFile(new URL('../../RuntimeData/同步器擴充功能/page-hook.js',import.meta.url),'utf8');
const dashboard = await readFile(new URL('../index.html',import.meta.url),'utf8');
function windPayload() {
  // Real 2026-10-15 cmd=516 shape; identity fields replaced with fixture IDs.
  const row=(id,time,values)=>({id,casino:'3',game:{id:'fixture-game',casino:'3',seq:'F106004'},
    group:{id:'fixture-group',no:'1'},bet_type:'1',created_at:`2026-10-15 ${time}`,
    amount:String(values.reduce((s,x)=>s+x[1],0)),details:values.map(([content,money],i)=>({id:i+1,play:1,content,money,water:28.4,odds:5.5789}))});
  return {status:true,total:2,rows:[row('new','20:25:32',[['7',190],['17',190],['27',190],['37',190]]),row('old','19:48:06',[['37',380]])]};
}
test('風雲背景 516→content→顯示，無明細 DOM 仍保留兩批正碼、實際車數與所有原始 gateway IDs',()=>{
  const payload=windPayload(),messages=[],games=[{casino:3,name:'539',carUnit:3800,numBalls:39}];
  const h={URL,location:{hostname:'www.vs968.net',href:'https://www.vs968.net/new_web/'},
    window:{postMessage:m=>messages.push(m)},document:{querySelector:()=>null},
    findVueStore:()=>({getters:{seqs:games}}),rejectOversizedObservedResponse:()=>false};
  vm.runInNewContext(`let lastRequest,lastDetailResponse;${hook.slice(hook.indexOf('  const publish ='),hook.indexOf('  const PASSIVE_OBSERVATION_TIMEOUT_MS'))};this.publish=publish`,h);
  h.publish('https://www.vs968.net/pub/SuperGateway.php?game_id=0&group_id=0&sort=time-desc','GET','','',JSON.stringify(payload));
  assert.ok(messages[0].gatewayGames,'必須取得來源遊戲設定');
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0].gatewayGames)),games.map(({numBalls,...g})=>g));
  const {c}=scope();c.location.hostname='www.vs968.net';
  vm.runInNewContext(gateway,c);
  const bets=c.scrapeVs968Json(messages[0].response,messages[0].gatewayGames);
  assert.equal(bets.length,5);
  assert.deepEqual(Array.from(bets,b=>b.id),['www.vs968.net|gateway|new|1','www.vs968.net|gateway|new|2','www.vs968.net|gateway|new|3','www.vs968.net|gateway|new|4','www.vs968.net|gateway|old|1']);
  assert.ok(bets.every(b=>b.playType==='正碼'&&b.event==='539 / F106004 - 001'));
  assert.deepEqual(Array.from(bets,b=>b.carCount),[.05,.05,.05,.05,.1]);
  assert.equal(bets.reduce((s,b)=>s+b.betAmount,0),1140);
  const d={};vm.runInNewContext(dashboard.match(/function isDeletedBet[\s\S]*?(?=\nfunction displayBets)/)[0],d);
  const displayed=d.collapseWindNumberBatches(d.dedupeExactBets(bets));
  assert.equal(displayed.length,2);assert.deepEqual(Array.from(displayed,b=>b.betAmount),[760,380]);
  assert.deepEqual(Array.from(displayed,b=>b.ids.length),[4,1]);
  assert.deepEqual(Array.from(displayed[0]._windDetails,x=>x.number),['07','17','27','37']);
  assert.equal(c.sendCurrentBets(bets,messages[0].currentProof,'gateway'),true);
  const other=structuredClone(payload);other.rows[0].id='other';
  const double=c.scrapeVs968Json(JSON.stringify({...payload,total:3,rows:[...payload.rows,other.rows[0]]}),games);
  assert.equal(d.collapseWindNumberBatches(d.dedupeExactBets(double)).length,3,'同秒真實雙批不得合併');
});

test('風雲背景缺少來源車數設定不猜；不將 539 規則套到其他盤口或喜',()=>{
  const {c}=scope();c.location.hostname='www.vs968.net';vm.runInNewContext(gateway,c);
  const payload=windPayload();
  const missing=c.scrapeVs968Json(JSON.stringify(payload),[]);
  assert.ok(missing.every(b=>b.carCount==null&&b.parseStatus==='partial'));
  for(const game of [{casino:3,name:'539',carUnit:0},{casino:3,name:'未知',carUnit:3800}]) {
    assert.ok(c.scrapeVs968Json(JSON.stringify(payload),[game]).every(b=>b.parseStatus==='partial'));
  }
  const six={...payload.rows[0],casino:'1',game:{casino:'1',seq:'S606'},details:[{id:1,play:4,content:'91',money:200}],bet_type:'1'};
  const [taihao]=c.scrapeVs968Json(JSON.stringify({status:true,total:1,rows:[six]}),[{casino:1,name:'六合',carUnit:4800}]);
  assert.equal(taihao.playType,'台號');assert.equal(taihao.carCount,2);assert.equal(taihao.betAmount,200);
  c.location.hostname='www2.kd998.net';c.kdCarUnits={正碼:3800};
  const kd=c.scrapeVs968Json(JSON.stringify(payload),[{casino:3,name:'539',carUnit:1}]);
  assert.equal(kd.length,2);assert.equal(kd[0].id,'www2.kd998.net|kd-gateway-batch|new');
  assert.equal(kd[0].betAmount,760);assert.equal(kd[0].carCount,.2,'喜仍沿用自己的已學習單位，不讀風雲 metadata');
});
