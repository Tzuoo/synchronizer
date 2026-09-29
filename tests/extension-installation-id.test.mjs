import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../RuntimeData/同步器擴充功能/background.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('async function getInstallationId('), source.indexOf('async function uploadLedgerRows('));

function setup() {
  let stored='', failGet=false, failSet=false, creates=0, reads=0;
  const context=vm.createContext({
    crypto:{randomUUID(){creates++;return `created-${creates}`;}},
    chrome:{storage:{local:{
      async get(){reads++;if(failGet){failGet=false;throw new Error('get failed');}return {installationId:stored};},
      async set({installationId}){if(failSet){failSet=false;throw new Error('set failed');}stored=installationId;},
    }}},
  });
  vm.runInContext(`let installationIdPromise;${helper};globalThis.getInstallationId=getInstallationId`,context);
  return {context,failGet(){failGet=true;},failSet(){failSet=true;},get creates(){return creates;},get reads(){return reads;},get stored(){return stored;}};
}

test('M06 failed storage get/set does not poison installation ID retry',async()=>{
  for(const failure of ['failGet','failSet']){
    const fixture=setup();fixture[failure]();
    await assert.rejects(fixture.context.getInstallationId(),/failed/);
    const recovered=await fixture.context.getInstallationId();
    assert.equal(recovered,fixture.stored);
    assert.equal(fixture.reads,2);
  }
});

test('M06 concurrent calls share one successful initialization and existing ID is preserved',async()=>{
  const fixture=setup();
  const result=await Promise.all(Array.from({length:20},()=>fixture.context.getInstallationId()));
  assert.equal(new Set(result).size,1);
  assert.equal(fixture.creates,1);
  assert.equal(fixture.reads,1);
  assert.equal(await fixture.context.getInstallationId(),result[0]);
  assert.equal(fixture.reads,1);
});
