import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const background = readFileSync(new URL('../../RuntimeData/同步器擴充功能/background.js', import.meta.url), 'utf8');
for (const consumer of ['web', 'extension']) {
  test(`C-01 ${consumer} 新分頁完成後排序，舊 API 保留原順序`, async () => {
    const source = consumer === 'web'
      ? html.slice(html.indexOf('async function fetchBetPayload('), html.indexOf('\n', html.indexOf('async function fetchBetPayload(')))
      : background.slice(background.indexOf('async function fetchAllBetPages('), background.indexOf('let localPreviewRefreshPromise'));
    let pages;
    const context = vm.createContext({ URL, location: { href: 'https://example.test' }, IS_LOCAL_PREVIEW: false,
      fetchJsonWithTimeout: async () => ({ response: { ok: true, status: 200 }, payload: pages.shift() }) });
    vm.runInContext(source, context);
    const call = () => consumer === 'web' ? context.fetchBetPayload('https://example.test').then(r => r.payload) : context.fetchAllBetPages('https://example.test');
    const older = { id: 'a', placedAt: '2026-09-27T01:00:00Z' }, newer = { id: 'b', placedAt: '2026-09-27T02:00:00Z' };
    pages = [{ bets: [older], page: { hasMore: true, nextCursor: 'next', order: 'rowid-desc' } }, { bets: [newer], page: { hasMore: false, order: 'rowid-desc' } }];
    assert.equal((await call()).bets.map(b => b.id).join(','), 'b,a');
    pages = [{ bets: [older, newer] }];
    assert.equal((await call()).bets.map(b => b.id).join(','), 'a,b');
  });
}
