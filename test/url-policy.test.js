'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isPublicAddress, validateTarget } = require('../src/security/url-policy');

test('rejects loopback and private IPv4 addresses', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('rejects loopback and private IPv6 addresses', () => {
  for (const ip of ['::1', 'fc00::1', 'fe80::1', '::']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('accepts public unicast examples', () => {
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('rejects loopback URLs and non-HTTP schemes before network access', async () => {
  await assert.rejects(validateTarget('http://127.0.0.1/'), /non-public|Private/i);
  await assert.rejects(validateTarget('http://localhost/'), /Local and internal/i);
  await assert.rejects(validateTarget('file:///etc/passwd'), /HTTP and HTTPS/i);
  await assert.rejects(validateTarget('http://user:pass@example.com/'), /credentials/i);
});
