import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const extensionRoot = new URL("../RuntimeData/同步器擴充功能/", import.meta.url);
const content = await readFile(new URL("content.js", extensionRoot), "utf8");
const manifest = JSON.parse(await readFile(new URL("manifest.json", extensionRoot), "utf8"));

test("航海新網域會載入解析程式", () => {
  assert.ok(manifest.content_scripts.every(script => script.matches.includes("*://*.pee688.com/*")));
  assert.match(content, /"pee688\.com": "航海"/);
  assert.match(content, /\["amc283\.com", "pee688\.com"\]\.includes\(rootDomain\(location\.hostname\)\)/);
});

test("共用明細解析保留盤口但玩法名稱仍獨立", () => {
  assert.match(content, /event: eventWithGameSection\(block\.gameSection, play\)/);
  assert.match(content, /event: eventWithGameSection\(gameSection, event\)/);
  assert.match(content, /playType: play/);
  assert.match(content, /playType: event/);
});

test("喜網站不建立第二個隱藏 SPA 造成登入工作階段衝突", () => {
  assert.doesNotMatch(content, /function ensureKdBackgroundLedger/);
  assert.doesNotMatch(content, /data-sync-kd-ledger/);
  assert.match(content, /setInterval\(syncLedgerDom, 10000\)/);
  assert.match(content, /isSharedGatewayWorkFrame/);
});
