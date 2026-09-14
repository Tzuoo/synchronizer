import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../RuntimeData/同步器擴充功能/options.js', import.meta.url), 'utf8');
const functionSource = source.match(/function normalizeTransfer[\s\S]*?\n}\n/)?.[0];
assert.ok(functionSource, 'settings transfer validation must exist');
const context = { sites: ['one.example', 'two.example'] };
vm.runInNewContext(`${functionSource};globalThis.normalizeTransfer=normalizeTransfer`, context);

test('設定搬移只接受同步權杖與已知網站帳號', () => {
  const actual = context.normalizeTransfer({schemaVersion:1,settings:{syncToken:' token ',siteAccounts:{'one.example':' a ','unknown.example':'ignore'}}});
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), {syncToken:'token',siteAccounts:{'one.example':'a','two.example':''}});
  assert.throws(() => context.normalizeTransfer({schemaVersion:1,settings:{syncToken:'x',siteAccounts:[]}}));
  assert.throws(() => context.normalizeTransfer({schemaVersion:2,settings:{syncToken:'x',siteAccounts:{}}}));
});

test('設定搬移不會包含裝置名稱、裝置 ID 或 Chrome 個人資料', () => {
  assert.match(source, /schemaVersion:1,exportedAt:new Date\(\)\.toISOString\(\),settings:settingsFromForm\(\)/);
  assert.doesNotMatch(source, /installationId|diagnosticDeviceLabel|cookies|passwords/i);
  assert.match(source, /同步器設定搬移\.json/);
});
