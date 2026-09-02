import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../RuntimeData/同步器擴充功能/', import.meta.url);
const css = await readFile(new URL('style.css', root), 'utf8');
const html = await readFile(new URL('popup.html', root), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const declarations = selector => rules.find(([, key]) => key.trim() === selector)?.[2] ?? '';

test('彈出視窗固定寬度，不受視窗寬度反饋影響', () => {
  assert.match(html, /<html[^>]*class="popup-root"/);
  for (const selector of ['html.popup-root', 'body.popup']) {
    const rule = declarations(selector);
    for (const property of ['width', 'min-width', 'max-width']) {
      assert.ok(rule.split(';').includes(property + ':388px'));
    }
    assert.doesNotMatch(rule, /vw|%/);
  }
  assert.match(declarations('body.popup'), /box-sizing:border-box/);
  assert.doesNotMatch(css, /main\s*,\s*\.popup/);
  assert.ok(declarations('main').includes('max-width:calc(100vw - 48px)'));
});

test('長診斷只在彈窗內垂直捲動並可斷行', () => {
  const body = declarations('body.popup');
  assert.match(body, /max-height:560px/);
  assert.match(body, /overflow-y:auto/);
  assert.match(body, /overflow-x:hidden/);
  assert.match(body, /overflow-wrap:anywhere/);
  assert.match(declarations('html.popup-root'), /overflow:hidden/);
});
