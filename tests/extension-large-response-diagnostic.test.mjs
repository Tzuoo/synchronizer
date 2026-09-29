import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const extension = new URL('../../RuntimeData/同步器擴充功能/', import.meta.url);
const [hook, content, background, diagnostics] = await Promise.all([
  readFile(new URL('page-hook.js', extension), 'utf8'),
  readFile(new URL('src/content/ledger.js', extension), 'utf8'),
  readFile(new URL('background.js', extension), 'utf8'),
  readFile(new URL('diagnostics.js', extension), 'utf8'),
]);

test('M01 oversized supported response reaches content, local diagnostic storage and API rows without secrets', async () => {
  const state = {};
  const storage = { siteDiagnostics: state };
  const chrome = {
    runtime: { getManifest: () => ({ version: 'test' }) },
    storage: { local: {
      get: async () => ({ ...storage }),
      set: async values => Object.assign(storage, values),
    } },
  };
  const backgroundContext = vm.createContext({ chrome, Date, storage });
  const diagnosticStart = background.indexOf('let diagnosticQueue = Promise.resolve()');
  const diagnosticEnd = background.indexOf('let diagnosticUploadBusy = false', diagnosticStart);
  vm.runInContext(`${diagnostics}${background.slice(diagnosticStart, diagnosticEnd)}
    function rootDomain(host) { return host.split('.').slice(-2).join('.'); }
    globalThis.accept = state => updateSiteDiagnostic('www.hyp98.com', state);
    globalThis.rows = () => SyncDiagnostics.rows(storage.siteDiagnostics);`,
  backgroundContext);

  const messages = [];
  const sent = [];
  const contentWindow = { addEventListener: (name, listener) => {
    if (name === 'message') messages.push(listener);
  } };
  const contentStart = content.indexOf("window.addEventListener('message', (event) => {");
  const contentEnd = content.indexOf('window.addEventListener("message"', contentStart);
  assert.ok(contentStart >= 0 && contentEnd > contentStart);
  vm.runInContext(content.slice(contentStart, contentEnd), vm.createContext({
    window: contentWindow,
    safeMessage: message => { sent.push(message); return backgroundContext.accept(message.state); },
  }));

  const posted = [];
  const hookWindow = { postMessage: message => {
    posted.push(message);
    for (const listener of messages) listener({ source: contentWindow, data: message });
  } };
  const hookStart = hook.indexOf('const MAX_OBSERVED_RESPONSE_CHARS');
  const hookEnd = hook.indexOf('const PASSIVE_OBSERVATION_TIMEOUT_MS', hookStart);
  const hookContext = vm.createContext({
    URL, window: hookWindow,
    location: { href: 'https://www.hyp98.com/Front/A/A07', hostname: 'www.hyp98.com' },
  });
  vm.runInContext(`let lastRequest=null,lastDetailResponse=null;${hook.slice(hookStart, hookEnd)};globalThis.publish=publish`, hookContext);

  const secret = 'private-session-token';
  const oversized = `{"DataList":"${'x'.repeat(500001)}${secret}"}`;
  hookContext.publish(`https://www.hyp98.com/api/Front/A07/Query?token=${secret}`, 'POST', '', 'application/json', oversized);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(posted.at(-1)?.type, 'SYNC_DIAGNOSTIC_EVENT');
  assert.equal(sent.at(-1)?.type, 'SITE_DIAGNOSTIC');
  const rows = backgroundContext.rows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stage, 'parse');
  assert.equal(rows[0].code, 'PARSE_FAILED');
  assert.doesNotMatch(JSON.stringify({ posted, sent, rows }), /private-session-token|DataList|500001/);

  const before = posted.length;
  hookContext.publish('https://www.hyp98.com/api/odds/Query', 'POST', '', 'application/json', oversized);
  assert.equal(posted.length, before, 'unrelated large endpoint should not raise a parser diagnostic');
});
