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
