'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeChallengeCookie, validChallengeCookie } = require('../src/security/proxy-challenge');
test('challenge cookie is signed, bound to IP, and expires', () => {
  const keys = ['IPQS_API_KEY','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','CHALLENGE_SIGNING_SECRET'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { IPQS_API_KEY:'test-key', TURNSTILE_SITE_KEY:'site-key', TURNSTILE_SECRET_KEY:'test-secret', CHALLENGE_SIGNING_SECRET:'s'.repeat(40) });
  try {
    const now = 1800000000000;
    const cookie = makeChallengeCookie('203.0.113.7', now);
    assert.equal(validChallengeCookie(cookie, '203.0.113.7', now + 1000), true);
    assert.equal(validChallengeCookie(cookie, '203.0.113.8', now + 1000), false);
    assert.equal(validChallengeCookie(cookie, '203.0.113.7', now + 31 * 60000), false);
    assert.equal(validChallengeCookie(cookie + 'x', '203.0.113.7', now + 1000), false);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
