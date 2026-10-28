'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyPage, extractData } = require('../src/services/scraper');

test('classifies browser-unsupported interstitial as unusable', () => {
  const html = '<html><head><title>Browser not supported</title></head><body><h1>Browser not supported</h1><p>Please use a supported browser to continue.</p></body></html>';
  assert.deepEqual(classifyPage(html), { status: 'unsupported_browser', usable: false, reason: 'browser_not_supported' });
});

test('classifies an authentication wall without pretending content was scraped', () => {
  const html = '<html><head><title>Sign in to continue</title></head><body><p>Please sign in to continue</p></body></html>';
  assert.equal(classifyPage(html).status, 'login_required');
});

test('keeps ordinary article pages usable and removes duplicate text', () => {
  const html = '<html><head><title>Example</title><link rel="canonical" href="/article"></head><body><nav>Menu</nav><main><h1>Example</h1><p>This is a useful article paragraph that contains enough readable content for extraction.</p><p>This is a useful article paragraph that contains enough readable content for extraction.</p></main></body></html>';
  const result = extractData(html, 'https://example.com/path');
  assert.equal(result.page.status, 'usable');
  assert.equal(result.meta.canonical, 'https://example.com/article');
  assert.equal(result.paragraphs.length, 1);
  assert.match(result.text, /useful article paragraph/);
  assert.doesNotMatch(result.text, /Menu/);
});

test('flags a nearly empty JavaScript app shell', () => {
  const html = '<html><head><title>App</title></head><body><div id="root"></div><script src="/bundle.js"></script><script src="/vendor.js"></script></body></html>';
  assert.equal(classifyPage(html).status, 'empty_shell');
});
