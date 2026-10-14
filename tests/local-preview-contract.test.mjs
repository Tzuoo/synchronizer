import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,copyFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const helper=await readFile(new URL('../current-bets.js',import.meta.url),'utf8');
const background=await readFile(new URL('../../RuntimeData/同步器擴充功能/background.js',import.meta.url),'utf8');
const list={complete:true,scope:'all',clientSite:'aaaaaaaa|188hot.net',account:'you320',capturedAt:'2026-10-15T00:00:00.000Z',lastSeen:'2026-10-15T00:00:00.000Z',ids:[]};
async function isFixtureService(h,{port,service,cache}) {
  if(h.port!==port||!Number.isInteger(h.processId)||h.processId<=0)return false;
  const canonical=async p=>(await realpath(p)).toLowerCase();
  return await canonical(h.scriptPath)===await canonical(service)&&await canonical(h.dataRoot)===await canonical(cache);
}
async function waitForFixtureExit(pid,{alive=p=>{try{process.kill(p,0);return true}catch(e){if(e.code==='ESRCH')return false;throw e}},now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=5000}={}) {
  const deadline=now()+timeoutMs;
  while(alive(pid)){
    if(now()>=deadline)throw Error('Fixture process has not exited; retain directory for diagnosis');
    await pause(50);
  }
}
async function listenAfterFixtureExit(server,port) {
  const deadline=Date.now()+2000;
  for(;;){
    try{server.listen(port,'127.0.0.1');await once(server,'listening');return}
    catch(e){if(e.code!=='EADDRINUSE'||Date.now()>=deadline)throw e;await new Promise(r=>setTimeout(r,50));}
  }
}
test('Windows fixture 實體路徑比對接受長短別名，但拒絕同尾端的其他目錄',{skip:process.platform!=='win32'},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'sync identity test ')),cache=path.join(dir,'cache'),service=path.join(dir,'service.ps1');await mkdir(cache);await writeFile(service,'fixture');
  try{
    const fixture={port:45678,cache,service},h={port:fixture.port,processId:12345,scriptPath:await realpath(service),dataRoot:await realpath(cache)};
    assert.equal(await isFixtureService(h,fixture),true);
    // This computer exposes the actual short-name alias in TEMP; do not require 8.3 support elsewhere.
    if(service.toLowerCase()!==h.scriptPath.toLowerCase())assert.notEqual(service,h.scriptPath,'legacy exact string comparison would reject this alias');
    const other=path.join(dir,'other',path.basename(dir));await mkdir(path.join(other,'cache'),{recursive:true});await writeFile(path.join(other,'service.ps1'),'unrelated fixture');
    assert.equal(await isFixtureService({...h,scriptPath:path.join(other,'service.ps1'),dataRoot:path.join(other,'cache')},fixture),false);
    assert.equal(await isFixtureService({...h,port:8765},fixture),false);
  }finally{assert.ok(dir.startsWith(path.join(tmpdir(),'sync identity test ')));await rm(dir,{recursive:true,force:true});}
});
test('fixture 清理等待實際退出，不以固定睡眠代替；逾時保留目錄且拒絕誤判成功',async()=>{
  let time=0,checks=0;
  await waitForFixtureExit(12345,{alive:()=>++checks<=8,now:()=>time,pause:async ms=>{time+=ms},timeoutMs:1000});assert.equal(time,400);
  time=0;await assert.rejects(waitForFixtureExit(12345,{alive:()=>true,now:()=>time,pause:async ms=>{time+=ms},timeoutMs:200}),/retain directory/);
  await assert.rejects(waitForFixtureExit(12345,{alive:()=>{throw Object.assign(Error('access denied'),{code:'EPERM'})}}),/access denied/);
});
function dashboard(payload){
  const label={textContent:''},panel={classList:{add(){},remove(){}}};let drawn=0;
  const initial=vm.runInNewContext(html.match(/renderSignature=([^,;]+)/)[1]);
  const c={Date,IS_LOCAL_PREVIEW:true,authToken:'',loadBusy:false,reconciledCache:{},bets:[],renderSignature:initial,
    fetchBetPayload:async()=>({response:{status:200},payload}),$:s=>s==='#sync'?panel:label,
    collapseWindNumberBatches:x=>x,suppressKdLegacyRows:x=>x,dedupeExactBets:x=>x,
    orderSignature:rows=>rows.map(b=>b.id).join('|'),draw:()=>drawn++};
  const start=html.indexOf('async function load(){');vm.runInNewContext(helper+'\n'+html.slice(start,html.indexOf('\ndraw=function()',start)),c);
  return{c,label,drawn:()=>drawn};
}
test('本機 fresh 但缺目前清單不能宣稱正常，資料不可誤清；成功完整空清單才正常',async()=>{
  const r=dashboard({bets:[{id:'legacy',source:'16'}],freshness:'fresh'});await r.c.load();assert.equal(r.c.bets.length,1);assert.doesNotMatch(r.label.textContent,/本機同步中/);assert.match(r.label.textContent,/清單|未確認/);
  const ok=dashboard({bets:[],currentLists:[list],membershipState:'complete',freshness:'fresh'});await ok.c.load();assert.equal(ok.label.textContent,'本機同步中');
});
test('成功空清單首次載入一定初始化畫面，後續相同空清單不重畫',async()=>{
  const r=dashboard({bets:[],currentLists:[list],membershipState:'complete',freshness:'fresh'});await r.c.load();assert.equal(r.drawn(),1);await r.c.load();assert.equal(r.drawn(),1);
});
test('本機沒有雲端 token 仍從本機 endpoint 顯示實際擴充回報',async()=>{
  const requests=[],clients=[{installationId:'aaaaaaaa',extensionVersion:'1.6.86',site:'aaaaaaaa|188hot.net',lastSeen:list.lastSeen}];let rendered;
  const c={IS_LOCAL_PREVIEW:true,authToken:'',API_ROOT:'https://unrelated.test/api',fetchJsonWithTimeout:async(url,init)=>{requests.push({url,init});return{response:{ok:true,status:200},payload:{clients}}},renderClientStatus:r=>rendered=r,loadRemoteDiagnostics:()=>{throw Error('local must not query remote diagnostics')}};
  const start=html.indexOf('async function loadClientStatus()');vm.runInNewContext(html.slice(start,html.indexOf('\nfunction prepareLedgerView',start)),c);await c.loadClientStatus();assert.deepEqual(rendered,clients);assert.equal(requests[0].url,'/__sync/client-status');assert.equal(requests[0].init.headers.authorization,undefined);
});
test('擴充本機回報使用實際安裝ID與manifest，只傳安全摘要，失敗亦可回報',async()=>{
  const c={Date,TextEncoder,URL,AbortController,LOCAL_REQUEST_TIMEOUT_MS:5000,LOCAL_PREVIEW_CACHE:'http://127.0.0.1:8765/__sync/cache',DASHBOARD:'https://isolated.test',
    rootDomain:h=>h.split('.').slice(-2).join('.'),todayLedgerDate:()=> '2026-10-15',clientSiteKey:(id,root)=>id+'|'+root,getInstallationId:async()=> 'aaaaaaaa',
    chrome:{storage:{local:{get:async()=>({syncToken:'synthetic-private-token',installationId:'aaaaaaaa',ledgerSnapshots:[]})}},tabs:{query:async()=>[{url:'https://w1.188hot.net/'},{url:'https://tzuoo.github.io/'}]},runtime:{getManifest:()=>({version:'1.6.86'})}},
    btoa:s=>Buffer.from(s,'binary').toString('base64'),withRequestTimeout:async task=>task(new AbortController().signal),fetchAllBetPages:async()=>({bets:[],currentLists:[list]})};
  const sent=[];c.fetch=async(url,init)=>{if(url===c.LOCAL_PREVIEW_CACHE)sent.push(JSON.parse(Buffer.from(init.body,'base64').toString()));return{ok:true}};
  vm.runInNewContext(background.slice(background.indexOf('let localPreviewRefreshPromise'),background.indexOf('chrome.alarms.create')),c);await c.refreshLocalPreviewCache(true);
  assert.equal(sent[0].clients.length,1);assert.equal(sent[0].clients[0].installationId,'aaaaaaaa');assert.equal(sent[0].clients[0].extensionVersion,'1.6.86');assert.equal(sent[0].clients[0].site,'aaaaaaaa|188hot.net');assert.ok(!JSON.stringify(sent).includes('synthetic-private-token'));
  c.fetchAllBetPages=async()=>{throw Error('isolated remote failure')};await c.refreshLocalPreviewCache(true);assert.equal(sent[1].refreshOk,false);assert.equal(sent[1].clients[0].extensionVersion,'1.6.86');
});
test('隔離服務：健康契約、缺清單／空／失敗區分及本機安全回報', {skip:process.platform!=='win32',timeout:20000},async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'sync-local-contract-')),web=path.join(dir,'web');await mkdir(web);await writeFile(path.join(web,'index.html'),'fixture');
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const script=fileURLToPath(new URL('../../本機同步器/Local-SynchronizerServer.ps1',import.meta.url));
  const child=spawn('powershell.exe',['-NoProfile','-File',script,'-Port',String(port),'-WebRoot',web,'-DataDirectory',path.join(dir,'cache')],{windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',s=>errors+=s);
  t.after(async()=>{if(child.exitCode===null){const ended=once(child,'exit');child.kill();await ended;}assert.ok(dir.startsWith(path.join(tmpdir(),'sync-local-contract-')));await rm(dir,{recursive:true,force:true});});
  const get=async route=>{const r=await fetch(`http://127.0.0.1:${port}${route}`);assert.equal(r.status,200);return r.json()};let health;
  for(let i=0;i<50;i++){try{health=await get('/__sync/health');break}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(health,errors);assert.equal(health.cacheSchemaVersion,2);assert.equal(health.serviceVersion,1);assert.equal(health.processId,child.pid);assert.match(health.sourceHash,/^[a-f0-9]{64}$/);
  const post=async payload=>{const r=await fetch(`http://127.0.0.1:${port}/__sync/cache`,{method:'POST',headers:{'x-sync-encoding':'base64'},body:Buffer.from(JSON.stringify(payload)).toString('base64')});assert.equal(r.status,200)};
  await post({bets:[]});let p=await get('/__sync/bets');assert.notEqual(p.freshness,'fresh');assert.equal(p.membershipState,'missing');
  const rows=[{id:list.clientSite+'|you320|old',source:'16',account:'you320'}];const clients=[{installationId:'aaaaaaaa',extensionVersion:'1.6.86',site:list.clientSite,lastSeen:list.lastSeen,token:'must-not-persist'}];
  await post({bets:rows,currentLists:[list],clients});p=await get('/__sync/bets');assert.equal(p.freshness,'fresh');assert.equal(p.membershipState,'complete');assert.deepEqual(p.currentLists[0].ids,[]);assert.deepEqual(p.bets,rows);const successAt=p.lastSuccessAt;
  const report=await get('/__sync/client-status');assert.equal(report.clients.length,1);assert.equal(report.clients[0].extensionVersion,'1.6.86');assert.ok(!JSON.stringify(report).includes('must-not-persist'));
  await post({bets:[]});p=await get('/__sync/bets');assert.notEqual(p.freshness,'fresh');assert.deepEqual(p.bets,rows);assert.deepEqual(p.currentLists[0].ids,[]);assert.equal(p.lastSuccessAt,successAt);
  await post({refreshOk:false,errorCode:'REMOTE_FETCH_FAILED'});p=await get('/__sync/bets');assert.equal(p.freshness,'stale');assert.deepEqual(p.bets,rows);assert.equal(p.lastErrorCode,'REMOTE_FETCH_FAILED');
  for(const currentLists of [[],[{...list,complete:false}],[{...list,ids:['foreign|id']}],[{...list,clientSite:'aaaaaaaa|unknown.test'}]]){
    await post({bets:[],currentLists});p=await get('/__sync/bets');assert.notEqual(p.freshness,'fresh');assert.deepEqual(p.bets,rows);assert.deepEqual(p.currentLists,[list]);
  }
});
test('啟動器隔離：新版重用、舊契約安全重啟且保留快取、不同資料範圍及無關程序拒絕', {skip:process.platform!=='win32',timeout:60000},async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'sync launcher scope ')),web=path.join(dir,'web'),cache=path.join(dir,'cache');await mkdir(web);await mkdir(cache);await writeFile(path.join(web,'index.html'),'fixture');
  const files=['Local-SynchronizerServer.ps1','Local-ServiceContract.ps1','Start-LocalSynchronizer.ps1'];for(const f of files)await copyFile(fileURLToPath(new URL('../../本機同步器/'+f,import.meta.url)),path.join(dir,f));
  const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const service=path.join(dir,files[0]),launcher=path.join(dir,files[2]);let servicePid;
  const run=async(file,args=[])=>{const child=spawn('powershell.exe',['-NoProfile','-File',file,...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>out+=v);const [code]=await once(child,'exit');return{code,out}};
  const launch=()=>run(launcher,['-NoBrowser','-Port',String(port),'-WebRoot',web,'-DataDirectory',cache]);
  const health=async()=>{const r=await fetch(`http://127.0.0.1:${port}/__sync/health`,{signal:AbortSignal.timeout(2000)});assert.equal(r.status,200);return r.json()};
  // Cleanup only the child serving this isolated copied script, never port 8765.
  t.after(async()=>{
    assert.ok(dir.startsWith(path.join(tmpdir(),'sync launcher scope ')));
    let h;try{h=await health()}catch(e){
      if(!servicePid)throw Error('Cannot verify fixture process; retain directory for diagnosis',{cause:e});
      await waitForFixtureExit(servicePid);
    }
    if(h){
      assert.equal(await isFixtureService(h,{port,service,cache}),true,'unverified listener must not be stopped or cleaned');
      try{process.kill(h.processId)}catch(e){if(e.code!=='ESRCH')throw e}
      await waitForFixtureExit(h.processId);
    }
    await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  });
  await writeFile(path.join(cache,'preview.json'),JSON.stringify({bets:[{id:'must-preserve'}]}));const before=await readFile(path.join(cache,'preview.json'),'utf8');
  let result=await launch();assert.equal(result.code,0,result.out);let h=await health();servicePid=h.processId;assert.equal(h.cacheSchemaVersion,2);
  result=await launch();assert.equal(result.code,0,result.out);assert.equal((await health()).processId,servicePid,'compatible service must be reused');
  const source=await readFile(service,'utf8');await writeFile(service,source.replace('cacheSchemaVersion=2','cacheSchemaVersion=1'));
  // Changed on-disk source invalidates the old process; the altered fixture is then restored.
  result=await launch();assert.notEqual(result.code,0,'an incompatible fixture cannot claim a compatible start');let old=await health();assert.notEqual(old.processId,servicePid);assert.equal(old.cacheSchemaVersion,1);servicePid=old.processId;
  await writeFile(service,source);result=await launch();assert.equal(result.code,0,result.out);h=await health();assert.notEqual(h.processId,servicePid);servicePid=h.processId;assert.equal(h.cacheSchemaVersion,2);assert.equal(await readFile(path.join(cache,'preview.json'),'utf8'),before);
  result=await run(launcher,['-NoBrowser','-Port',String(port),'-WebRoot',web,'-DataDirectory',path.join(dir,'different cache')]);assert.notEqual(result.code,0);assert.match(result.out,/Different port\/data scope/);assert.equal((await health()).processId,servicePid);
  process.kill(servicePid);await waitForFixtureExit(servicePid);servicePid=null;const unrelated=net.createServer(socket=>socket.end());await listenAfterFixtureExit(unrelated,port);try{result=await launch();assert.notEqual(result.code,0);assert.match(result.out,/Unrelated listener/);assert.ok(unrelated.listening);}finally{await new Promise(r=>unrelated.close(r));}
  const relative=spawn('powershell.exe',['-NoProfile','-File',service,'-Port',String(port),'-WebRoot','web','-DataDirectory',cache],{cwd:dir,windowsHide:true,stdio:'ignore'});servicePid=relative.pid;
  let relativeHealth;for(let i=0;i<50;i++){try{relativeHealth=await health();break}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(relativeHealth?.processId,relative.pid);
  result=await launch();assert.notEqual(result.code,0);assert.match(result.out,/Relative process scope/);assert.equal((await health()).processId,relative.pid,'unknown cwd must not be guessed when restarting');
});
