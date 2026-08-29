import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const content = await readFile(new URL("../RuntimeData/同步器擴充功能/content.js", import.meta.url), "utf8");
const background = await readFile(new URL("../RuntimeData/同步器擴充功能/background.js", import.meta.url), "utf8");
const pageHook = await readFile(new URL("../RuntimeData/同步器擴充功能/page-hook.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../RuntimeData/同步器擴充功能/manifest.json", import.meta.url), "utf8"));
const source = content.match(/function normalizeLedgerPhaseName[\s\S]*?(?=\nfunction storeLedgerSnapshot)/)?.[0];
assert.ok(source, "同型總帳解析器必須存在");

const node = value => ({ innerText: value, textContent: value });
const makeRow = (gameName, cells) => ({
  children: cells.map(node),
  closest: selector => selector === ".bet_group.f_group"
    ? { querySelector: query => query === ":scope > .panel_title" ? node(gameName) : null }
    : null,
});
const ledger = {
  querySelectorAll(selector) {
    if (selector === ".tr.tr-head .th") return ["期數 [ 日期 ]", "名稱", "總量", "退水", "中獎", "輸贏", "小計"].map(node);
    if (selector === ".tr.tr-body") return [
      makeRow("加拿大彩", ["第F2844期 >", "", "0", "0", "0", "0", "0"]),
      makeRow("六合", ["第S590期 >", "台號", "4500", "1125", "1720.0000762939", "-1654.9999237061", "-1654.9999237061"]),
      makeRow("539", ["第C115209期 >", "正碼", "3000", "750", "600", "-2400", "-2400"]),
    ];
    return [];
  },
};

const context = {
  location: { hostname: "www.vs968.net" },
  rootDomain: () => "vs968.net",
  SITE_NAMES: { "vs968.net": "風雲", "kd998.net": "喜" },
  taiwanDateKey: () => "2026-08-28",
  numeric: value => {
    const number = Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(number) ? number : null;
  },
};
vm.runInNewContext(`${source};globalThis.scrape=scrapeSharedLedger`, context);

test("風雲同型總帳依網站原始遊戲分區保存", () => {
  const rows = context.scrape({ querySelector: selector => selector === "#ledger_01" ? ledger : null }, new Date("2026-08-28T00:00:00Z"));
  assert.equal(rows.length, 2, "沒有玩法的加拿大彩列不可以當成已確認的 0");
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(row => [row.gameName, row.phaseName, row.playType, row.totalAmount, row.winningAmount]))), [
    ["六合", "S590", "台號", 4500, 1720.0000762939],
    ["539", "C115209", "正碼", 3000, 600],
  ]);
});

test("喜與風雲共用表頭解析但網站來源不可混用", () => {
  assert.match(source, /\["kd998\.net", "vs968\.net"\]/);
  assert.match(source, /SITE_NAMES\[domain\]/);
  assert.match(background, /row\.gameName, row\.phaseName, row\.playType/);
});

test("航海使用已確認的 A07 路由並保留網站回傳玩法順序", () => {
  assert.match(content, /"umh693\.com", "pee688\.com"/);
  assert.match(content, /return `\$\{location\.origin\}\$\{prefix\}\/Front\/A\/A07`/);
  assert.match(background, /\.map\(\(row, sourceOrder\) =>/);
  assert.match(background, /root: domain, sourceOrder/);
});

test("風雲與喜不建立第二個 SPA 並由網站 Vuex 背景取得總帳", () => {
  assert.match(pageHook, /store\.dispatch\("Ledger\.c520"\)/);
  assert.match(pageHook, /store\.dispatch\("Ledger\.c533", seq\.id\)/);
  assert.match(pageHook, /casinoLabel/);
  assert.match(pageHook, /play\.label/);
  assert.match(content, /SYNC_SHARED_LEDGER_ROWS/);
  assert.match(content, /SYNC_POLL_SHARED_LEDGER/);
  assert.doesNotMatch(content, /ensureKdBackgroundLedger|data-sync-kd-ledger/);
});

test("背景分頁由擴充鬧鐘喚醒明細與總帳輪詢", () => {
  assert.ok(manifest.permissions.includes("alarms"));
  assert.match(background, /synchronizer-background-poll/);
  assert.match(background, /chrome\.tabs\.sendMessage\(tab\.id, \{ type: "SYNC_BACKGROUND_TICK" \}\)/);
  assert.match(content, /message\?\.type !== "SYNC_BACKGROUND_TICK"/);
  assert.match(content, /pollLearnedDetail\(\)/);
  assert.match(content, /pollSharedLedgerBackground\(\)/);
});

test("共版 Vuex 總帳保留網站原始盤口期數玩法與順序", async () => {
  const functions = pageHook.match(/let sharedLedgerBusy = false;[\s\S]*?(?=\n  const publish =)/)?.[0];
  assert.ok(functions);
  let posted;
  const ledgerState = { seqs: [] };
  const store = {
    state: { Ledger: ledgerState },
    async dispatch(action, id) {
      if (action === "Ledger.c520") ledgerState.seqs = [
        { id: 8, casinoLabel: "539", seq: "C115209", playItems: [] },
        { id: 9, casinoLabel: "大樂", seq: "B115069", playItems: [] },
      ];
      if (action === "Ledger.c533") {
        const seq = ledgerState.seqs.find((row) => row.id === id);
        seq.playItems = id === 8
          ? [{ label: "正碼", amount: 19000, win: 0 }]
          : [{ label: "二星", amount: 1200, win: 0 }, { label: "三星", amount: 1200, win: 0 }];
      }
    },
  };
  const sharedContext = {
    document: {
      querySelectorAll: () => [{ __vue__: { $store: store, $parent: null } }],
      documentElement: { dataset: {} },
    },
    location: { hostname: "www.vs968.net" },
    window: { postMessage: message => { posted = message; } },
  };
  vm.runInNewContext(`${functions};globalThis.poll=pollSharedLedger`, sharedContext);
  await sharedContext.poll();
  assert.deepEqual(JSON.parse(JSON.stringify(posted.rows)), [
    { gameName: "539", phaseName: "C115209", playType: "正碼", totalAmount: 19000, winningAmount: 0, sourceOrder: 0 },
    { gameName: "大樂", phaseName: "B115069", playType: "二星", totalAmount: 1200, winningAmount: 0, sourceOrder: 0 },
    { gameName: "大樂", phaseName: "B115069", playType: "三星", totalAmount: 1200, winningAmount: 0, sourceOrder: 1 },
  ]);
});
