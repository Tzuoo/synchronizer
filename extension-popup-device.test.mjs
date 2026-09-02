import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../RuntimeData/同步器擴充功能/popup.js', import.meta.url), 'utf8');
function openPopup(storage) {
  const elements = new Map();
  const makeElement = () => ({ textContent: '', value: '', disabled: true, listeners: {},
    addEventListener(event, handler) { this.listeners[event] = handler; },
    replaceChildren() {}, append() {} });
  const document = {
    querySelector(key) {
      if (!elements.has(key)) elements.set(key, makeElement());
      return elements.get(key);
    },
    createElement: makeElement
  };
  vm.runInNewContext(source, { document, chrome: {
    storage: { local: { get(keys, callback) { callback(storage); },
      async set(patch) { Object.assign(storage, patch); } } },
    runtime: { openOptionsPage() {} }
  } });
  return elements;
}

test('公司與家裡使用各自既有裝置 ID 和本機名稱，不互相修改診斷', async () => {
  const company = { installationId: 'company-id', diagnosticDeviceLabel: '公司',
    siteDiagnostics: { 'vs968.net': { uploadOk: false, uploadError: '公司錯誤' } } };
  const home = { installationId: 'home-id', siteDiagnostics: { 'vs968.net': { uploadOk: true } } };
  const original = JSON.stringify(company);
  const companyUI = openPopup(company);
  const homeUI = openPopup(home);
  assert.equal(companyUI.get('#device-label').value, '公司');
  assert.equal(companyUI.get('#device-id').textContent, '裝置識別：company-id');
  assert.equal(homeUI.get('#device-id').textContent, '裝置識別：home-id');
  homeUI.get('#device-label').value = '家裡';
  await homeUI.get('#device-label').listeners.change();
  assert.equal(home.diagnosticDeviceLabel, '家裡');
  assert.equal(JSON.stringify(company), original);
  assert.equal(home.installationId, 'home-id');
  assert.equal(openPopup(home).get('#device-label').value, '家裡');
  assert.doesNotMatch(source, /storage\.sync|fetch\(|randomUUID/);
});

test('尚無裝置 ID 時不猜測裝置或產生第二個 ID', () => {
  const ui = openPopup({ diagnosticDeviceLabel: '未知值' });
  assert.match(ui.get('#device-id').textContent, /尚未建立/);
  assert.equal(ui.get('#device-label').value, '');
});
