'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

test('health endpoint reports v3', async t => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.version, '3.0.0');
  assert.equal(body.status, 'ok');
});

test('admin endpoint is disabled without a token', async t => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/admin/stats`);
  assert.equal(response.status, 503);
});
