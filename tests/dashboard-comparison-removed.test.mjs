import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
test('比價頁與擴充命令移除，明細總帳及計算保留',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/compareTab|comparePanel|IS_COMPARE_VIEW|full-car-dashboard|star-drafts-dashboard|mark-six-quotes-dashboard/);
  for(const value of ['betsTab','ledgerTab','ledger-calculator.js'])assert.ok(html.includes(value));
  for(const file of ['background.js','page-hook.js','content.js','manifest.json']){
    const source=await readFile(new URL('../../RuntimeData/同步器擴充功能/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/PLAN_FULL_CAR|FULL_CAR_ADD|SYNC_WIND_CART|SYNC_QUOTE_REPORT|dashboard-bridge\.js/);
  }
  for(const file of ['full-car-dashboard.js','star-input-tables.js','star-drafts-dashboard.js','star-quotes-dashboard.js','mark-six-quotes-dashboard.js']){
    await assert.rejects(access(new URL('../'+file,import.meta.url)),{code:'ENOENT'});
  }
});
