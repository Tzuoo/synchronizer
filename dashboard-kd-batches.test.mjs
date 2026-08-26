import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const source = html.match(/function escapeHtml[\s\S]*?(?=\nfunction isDeletedBet)/)?.[0];
assert.ok(source, "structured selection functions must be present");
const context = { money: (value) => `$${Number(value).toLocaleString("en-US")}` };
vm.runInNewContext(`${source};globalThis.formatStructuredSelection=formatStructuredSelection`, context);
const suppressionSource = html.match(/function suppressKdLegacyRows[\s\S]*?(?=\nfunction displayBets)/)?.[0];
assert.ok(suppressionSource, "kd legacy suppression must be present");
vm.runInNewContext(`${suppressionSource};globalThis.suppressKdLegacyRows=suppressKdLegacyRows`, context);

test("喜網站同一批號碼以逐行明細顯示", () => {
  const selection = [
    "正碼｜07｜下注金額 1140｜車數 0.3 車",
    "正碼｜09｜下注金額 1900｜車數 0.5 車",
  ].join("\n");
  const output = context.formatStructuredSelection("正碼", selection, { source: "喜" });
  assert.equal((output.match(/class="bet-line"/g) || []).length, 2);
  assert.match(output, />07</);
  assert.match(output, />0.3車</);
  assert.match(output, />09</);
  assert.match(output, />0.5車</);
});

test("新批次只一對一隱藏其對應的舊逐筆資料", () => {
  const base = { source: "喜", account: "a0593", placedAt: "2026-08-26T20:26:43+08:00", event: "正碼", playType: "正碼", betAmount: 1140 };
  const rows = [
    { ...base, id: "www2.kd998.net|kd-batch|G-1|16", selection: "正碼｜07｜下注金額 1140｜車數 0.3 車" },
    { ...base, account: "未設定", id: "legacy-1", selection: "正碼 07" },
    { ...base, account: "未設定", id: "legacy-real-duplicate", selection: "正碼 07" },
  ];
  const output = context.suppressKdLegacyRows(rows);
  assert.deepEqual(Array.from(output, row => row.id), ["www2.kd998.net|kd-batch|G-1|16", "legacy-real-duplicate"]);
});

test("更正帳號後隱藏 F 開頭的錯誤群組帳號批次", () => {
  const selection = "正碼｜07｜下注金額 1140｜車數 0.3 車";
  const base = { source: "喜", placedAt: "2026-08-26T20:26:43+08:00", event: "正碼", playType: "正碼", betAmount: 1140, selection };
  const output = context.suppressKdLegacyRows([
    { ...base, account: "a0593", id: "kd998.net|a0593|kd-batch|G-1|16" },
    { ...base, account: "F106953", id: "kd998.net|F106953|kd-batch|G-1|16" },
  ]);
  assert.deepEqual(Array.from(output, row => row.account), ["a0593"]);
});
