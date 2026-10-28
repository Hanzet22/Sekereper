'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, renderErrorPage } = require('../src/security/error-pages');

test('escapes untrusted content before rendering custom error pages', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  const page = renderErrorPage({
    status: 403, code: '1998', title: '<img src=x>', message: '<script>bad()</script>',
  });
  assert.ok(page.includes('&lt;img src=x&gt;'));
  assert.ok(page.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(!page.includes('<script>bad()'));
});

test('custom pages expose the requested status/application codes', () => {
  for (const [status, code] of [[404, '404'], [429, '429'], [418, '418'], [403, '1998']]) {
    const page = renderErrorPage({ status, code, title: 'Test', message: 'Test message' });
    assert.ok(page.includes(`<div class="code">${code}</div>`));
    assert.ok(page.includes('HANZET-SCRAPER'));
  }
});
