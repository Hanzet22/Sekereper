'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, renderErrorPage, renderChallengePage } = require('../src/security/error-pages');

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
  for (const [status, code] of [[404, '404'], [429, '429'], [418, '418'], [413, '413'], [403, '1998']]) {
    const page = renderErrorPage({ status, code, title: 'Test', message: 'Test message' });
    assert.ok(page.includes(`<div class="code">${code}</div>`));
    assert.ok(page.includes('HANZET-SCRAPER'));
  }
});

test('challenge page exposes Turnstile widget and verification route', () => { const page = renderChallengePage('public-site-key'); assert.match(page, /challenges.cloudflare.com\/turnstile/); assert.match(page, /\/challenge\/verify/); assert.match(page, /public-site-key/); assert.doesNotMatch(page, /TURNSTILE_SECRET_KEY/); });

test('matching HTTP error pages include their configured video', () => {
  const videos = new Map([
    [403, 'https://files.catbox.moe/v2xl73.mp4'],
    [404, 'https://files.catbox.moe/yfd0hd.mp4'],
    [418, 'https://files.catbox.moe/06uaw4.mp4'],
    [429, 'https://files.catbox.moe/9yah42.mp4'],
  ]);
  for (const [status, url] of videos) {
    const page = renderErrorPage({ status, code: String(status), title: 'Test', message: 'Test message' });
    assert.ok(page.includes(url), `status ${status} should include its video`);
    assert.match(page, /<video controls autoplay muted loop playsinline preload="metadata">/);
  }
  const otherPage = renderErrorPage({ status: 413, code: '413', title: 'Payload Too Large', message: 'Too large' });
  assert.doesNotMatch(otherPage, /files\.catbox\.moe/);
});
