import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../../RuntimeData/同步器擴充功能/background.js',import.meta.url),'utf8');
const segment=source.slice(source.indexOf('let localPreviewRefreshPromise'),source.indexOf('chrome.alarms.create('));

test('M07 remote refresh failure reports stale cache without replacing existing bets',async()=>{
  const posts=[];
  const context=vm.createContext({
    Date,URL,TextEncoder,btoa:value=>Buffer.from(value,'binary').toString('base64'),
    setTimeout,clearTimeout,
    chrome:{storage:{local:{get:async()=>({syncToken:'token',ledgerSnapshots:[]})}},tabs:{query:async()=>[]}},
    rootDomain:()=> 'hyp98.com',todayLedgerDate:()=> '2026-09-29',
    withRequestTimeout:task=>task(new AbortController().signal),
    fetch:async(url,options)=>{posts.push({url,body:JSON.parse(Buffer.from(options.body,'base64').toString('utf8'))});return {ok:true};},
    fetchAllBetPages:async()=>{throw new Error('remote down');},
    DASHBOARD:'https://example.test',LOCAL_PREVIEW_CACHE:'http://127.0.0.1:8765/__sync/cache',LOCAL_REQUEST_TIMEOUT_MS:1000,
  });
  vm.runInContext(`${segment};globalThis.refresh=refreshLocalPreviewCache`,context);
  await context.refresh(true);
  const cachePosts=posts.filter(post=>post.url.endsWith('/__sync/cache'));
  assert.equal(cachePosts.length,1);
  assert.deepEqual(cachePosts[0].body,{refreshOk:false,errorCode:'REMOTE_FETCH_FAILED'});
  assert.doesNotMatch(JSON.stringify(cachePosts),/remote down|token/);
});
