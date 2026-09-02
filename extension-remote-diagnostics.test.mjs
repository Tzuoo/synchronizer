import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const root=new URL('../RuntimeData/同步器擴充功能/',import.meta.url);
const code=await readFile(new URL('diagnostics.js',root),'utf8');
const background=await readFile(new URL('background.js',root),'utf8');
const context=vm.createContext({});vm.runInContext(code+';this.api=SyncDiagnostics;',context);
const {record,rows}=context.api;
test('errors survive recovery, zero counts, different stages and repeated uploads',()=>{
 const failed=record({}, {stage:'read',code:'READ_FAILED'},'2026-09-01T01:00:00.000Z');
 const empty=record(failed,{stage:'read',code:'EMPTY',count:0},'2026-09-01T02:00:00.000Z');
 assert.equal(empty.status,'waiting');assert.equal(empty.recoveredAt,null);
 const recovered=record(empty,{stage:'read',code:'OK'},'2026-09-01T03:00:00.000Z');
 assert.equal(recovered.lastErrorAt,failed.lastErrorAt);assert.ok(recovered.recoveredAt);
 const payload=rows({'vs968.net':{framePath:'/secret',uploadError:'raw-token',stages:{read:recovered}}});
 assert.equal(payload.length,1);assert.doesNotMatch(JSON.stringify(payload),/secret|raw-token/);
 assert.match(background,/diagnosticQueue = task.catch/);
 assert.match(background,/flushRemoteDiagnostics\(\)/);
 assert.doesNotMatch(background,/chrome\.notifications|alert\(/);
});
test('dashboard separates device labels, escapes contents and preserves error history',async()=>{
 const source=await readFile(new URL('./remote-diagnostics.js',import.meta.url),'utf8');
 const target={innerHTML:'',querySelectorAll:()=>[]};
 const ui=vm.createContext({document:{querySelector:()=>target},Date,Map,Set,Number,renderClientStatus(){},clientStatusRows:[],escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;')});
 vm.runInContext(source+';this.render=renderRemoteDiagnostics;',ui);
 ui.render([{installationId:'company-01',deviceLabel:'公司',site:'vs968.net',stage:'read',code:'READ_FAILED',status:'error',eventAt:'2026-09-01',lastErrorAt:'2026-09-01',lastErrorCode:'READ_FAILED',reportedAt:'2026-09-01'},
 {installationId:'home-0001',deviceLabel:'家裡',site:'vs968.net',stage:'read',code:'OK',status:'ok',eventAt:'2026-09-01',reportedAt:'2026-09-01'}]);
 assert.match(target.innerHTML,/公司/);assert.match(target.innerHTML,/家裡/);assert.match(target.innerHTML,/尚未確認恢復/);assert.match(target.innerHTML,/網站已離線/);
 assert.match(source,/headers:authHeaders\(\)/);assert.match(source,/response.status === 401/);
});
