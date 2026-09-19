import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../../RuntimeData/同步器擴充功能/", import.meta.url);
const hook = await readFile(new URL("page-hook.js", root), "utf8");
const sync = await readFile(new URL("src/content/sync.js", root), "utf8");

test("明細回應在內容腳本晚載入時可由 page-hook 重送", () => {
  assert.match(hook, /let lastDetailResponse = null/);
  assert.match(hook, /event\.data\?\.type === "SYNC_REQUEST_LAST_DETAIL"/);
  assert.match(hook, /if \(lastDetailResponse\) window\.postMessage\(lastDetailResponse, "\*"\)/);
  assert.match(sync, /window\.postMessage\(\{ type: "SYNC_REQUEST_LAST_DETAIL" \}, "\*"\)/);
});

test("補送只使用已取得的明細回應，不新增網站讀取", () => {
  const fragment = hook.match(/const publish = \(url, method, body, contentType, response, headers = \{\}\) => \{[\s\S]*?(?=\n  const nativeFetch)/)?.[0];
  assert.ok(fragment, "page-hook 明細發布器必須存在");
  const posted = [];
  const context = {
    URL,
    location: { href: "https://www.vs968.net/new_web/index.php", hostname: "www.vs968.net" },
    window: { postMessage: message => posted.push(message) },
  };
  vm.runInNewContext(`let lastRequest = null; let lastDetailResponse = null; ${fragment}; globalThis.publish = publish;`, context);
  context.publish("/SuperGateway.php?game_id=3&group_id=1&sort=time-desc", "GET", "", "", "下注明細內容", {});
  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, "SYNC_DETAIL_RESPONSE");
  assert.equal(posted[0].response, "下注明細內容");
});
