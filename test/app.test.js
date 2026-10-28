'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

async function withServer(t, callback) {
  const server = createApp().listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  return callback(`http://127.0.0.1:${server.address().port}`);
}

test('health endpoint reports v3.5 capabilities', async t => {
  await withServer(t, async base => {
    const response = await fetch(base + '/health');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.version, '3.5.0');
    assert.equal(body.status, 'ok');
    assert.equal(body.capabilities.crawlJobs, true);
    assert.ok(body.capabilities.export.includes('csv'));
  });
});

test('admin endpoint is disabled without a token', async t => {
  await withServer(t, async base => {
    const response = await fetch(base + '/admin/stats');
    assert.equal(response.status, 503);
  });
});

test('crawl endpoint validates bounded seed input', async t => {
  await withServer(t, async base => {
    const response = await fetch(base + '/crawl/jobs', {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({urls:[],maxPages:10})
    });
    assert.equal(response.status, 400);
  });
});

test('feed endpoint rejects non-text input', async t => {
  await withServer(t, async base => {
    const response = await fetch(base + '/parse/feed', {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({xml:42})
    });
    assert.equal(response.status, 400);
  });
});


test('HTML5 workbench and split UI assets are served by Express', async t => {
  await withServer(t, async base => {
    const pageResponse = await fetch(base + '/');
    assert.equal(pageResponse.status, 200);
    assert.match(pageResponse.headers.get('content-type') || '', /text\/html/i);
    const html = await pageResponse.text();
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /ui\/css\/app\.css/);
    assert.match(html, /ui\/js\/app\.js/);
    assert.doesNotMatch(html, /<style\b/i);
    const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
    assert.equal(scriptTags.filter(tag => !/\bsrc=/i.test(tag)).length, 0);
    const assets = [
      ['/ui/css/app.css', /--bg:/],
      ['/ui/css/tailwind.css', /\.sr-only/],
      ['/ui/js/app.js', /function apiUrl/],
      ['/ui/js/ambient-canvas.js', /paintWorklet/],
      ['/ui/worklets/hanzet-grid.js', /registerPaint/],
      ['/ui/assets/icons.svg', /icon-brand/],
      ['/ui/assets/favicon.svg', /<svg/i]
    ];
    for (const [assetPath, expected] of assets) {
      const response = await fetch(base + assetPath);
      assert.equal(response.status, 200, assetPath);
      assert.match(response.headers.get('content-type') || '', /(?:text|image|application)\//i);
      assert.match(await response.text(), expected, assetPath);
    }
  });
});

test('malformed JSON body returns HTTP 400', async t => {
  await withServer(t, async base => {
    const response = await fetch(base + '/parse/feed', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: '{"xml":'
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {error:'Invalid JSON body'});
  });
});

test('oversized JSON body returns HTTP 413 instead of HTTP 500', async t => {
  await withServer(t, async base => {
    const response = await fetch(base + '/parse/feed', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({xml:'x'.repeat(40 * 1024)})
    });
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /32kb limit/i);
  });
});

