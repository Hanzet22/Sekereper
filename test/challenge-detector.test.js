'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectChallenge } = require('../src/services/scraper');

test('detects a Cloudflare challenge interstitial', () => {
  const html = '<!doctype html><html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget">Checking your browser before accessing example.com. Enable JavaScript and cookies to continue.</div><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body></html>';
  assert.equal(detectChallenge(html), 'cloudflare_challenge');
});

test('detects a generic anti-bot challenge', () => {
  const html = '<html><head><title>Security check required</title></head><body><p>Please verify you are human to continue.</p></body></html>';
  assert.equal(detectChallenge(html), 'anti_bot_challenge');
});

test('does not classify an ordinary page mentioning Cloudflare', () => {
  const html = '<html><head><title>Example documentation</title><meta name="description" content="Cloudflare setup guide"></head><body><h1>Welcome</h1><p>This page explains how Cloudflare works in a typical deployment.</p></body></html>';
  assert.equal(detectChallenge(html), null);
});
