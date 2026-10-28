'use strict';
const crypto = require('node:crypto');
const net = require('node:net');
const ipaddr = require('ipaddr.js');
const { sendError, renderChallengePage } = require('./error-pages');
const cache = new Map();
const CACHE_TTL = 300000;
const COOKIE = 'hanzet_challenge';
const COOKIE_TTL = 1800;
function configured() {
  return Boolean(process.env.IPQS_API_KEY && process.env.TURNSTILE_SITE_KEY &&
    process.env.TURNSTILE_SECRET_KEY && process.env.CHALLENGE_SIGNING_SECRET &&
    process.env.CHALLENGE_SIGNING_SECRET.length >= 32);
}
function requestIp(req) {
  const raw = process.env.VERCEL === '1'
    ? String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0]).trim()
    : String(req.socket && req.socket.remoteAddress || '');
  if (!raw || net.isIP(raw) === 0) return null;
  try {
    let ip = ipaddr.parse(raw);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === 'unicast' ? ip.toString() : null;
  } catch { return null; }
}
function sign(payload) {
  return crypto.createHmac('sha256', process.env.CHALLENGE_SIGNING_SECRET).update(payload).digest('base64url');
}
function makeChallengeCookie(ip, now) {
  const payload = Buffer.from(JSON.stringify({ ip: ip, exp: (now || Date.now()) + COOKIE_TTL * 1000 })).toString('base64url');
  return payload + '.' + sign(payload);
}
function validChallengeCookie(cookie, ip, now) {
  if (!configured() || !cookie || !ip) return false;
  const parts = String(cookie).split('.');
  if (parts.length !== 2) return false;
  const expected = Buffer.from(sign(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return data.ip === ip && Number.isFinite(data.exp) && data.exp > (now || Date.now());
  } catch { return false; }
}
function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0, index).trim() === COOKIE) return part.slice(index + 1).trim();
  }
  return '';
}
async function lookupRisk(ip) {
  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.risky;
  const url = 'https://ipqualityscore.com/api/json/ip/' + encodeURIComponent(process.env.IPQS_API_KEY) + '/' + encodeURIComponent(ip) + '?strictness=1&fast=true';
  const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
  if (!response.ok) throw new Error('IP reputation lookup failed');
  const data = await response.json();
  if (data.success !== true) throw new Error('IP reputation provider returned an unsuccessful result');
  const risky = data.vpn === true || data.proxy === true || data.tor === true || data.recent_abuse === true || Number(data.fraud_score) >= 85;
  if (cache.size >= 5000) cache.clear();
  cache.set(ip, { risky: risky, expires: Date.now() + CACHE_TTL });
  return risky;
}
async function proxyChallenge(req, res, next) {
  if (!configured() || req.path === '/challenge' || req.path === '/challenge/verify' || req.path === '/health' || req.path.startsWith('/ui/')) return next();
  const ip = requestIp(req);
  if (!ip) return next();
  if (validChallengeCookie(readCookie(req), ip)) return next();
  try {
    if (!(await lookupRisk(ip))) return next();
    res.setHeader('X-Error-Code', '1998');
    res.setHeader('Cache-Control', 'no-store');
    if (String(req.headers.accept || '').includes('text/html')) return res.status(403).type('html').send(renderChallengePage(process.env.TURNSTILE_SITE_KEY));
    return sendError(req, res, { status: 403, code: '1998', title: 'Security Challenge Required', message: 'This connection needs verification before continuing.', detail: 'Open /challenge in a browser to complete verification.' });
  } catch (error) {
    console.warn('[security] IP reputation lookup unavailable:', error.message);
    return next();
  }
}
async function verifyChallenge(req, res) {
  if (!configured()) return res.status(503).json({ success: false, error: 'Challenge protection is not configured. Set IPQS_API_KEY, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY and CHALLENGE_SIGNING_SECRET (32+ characters).' });
  if (req.headers['x-hanzet-essential-consent'] !== 'true') {
    return res.status(428).json({ success: false, error: 'Essential / Security cookie consent is required to load and complete this optional challenge. Update Cookie Preferences first.' });
  }
  const ip = requestIp(req);
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!ip || !token || token.length > 4096) return res.status(400).json({ success: false, error: 'Missing or invalid challenge token.' });
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Challenge verification provider unavailable');
    const result = await response.json();
    if (result.success !== true) return res.status(403).json({ success: false, error: 'Challenge verification failed. Try again.' });
    res.setHeader('Set-Cookie', COOKIE + '=' + makeChallengeCookie(ip) + '; Max-Age=' + COOKIE_TTL + '; Path=/; HttpOnly; Secure; SameSite=Lax');
    return res.json({ success: true, expiresIn: COOKIE_TTL });
  } catch (error) {
    console.error('[security] challenge verification unavailable:', error.message);
    return res.status(503).json({ success: false, error: 'Challenge verification is temporarily unavailable. Try again shortly.' });
  }
}
module.exports = { configured, requestIp, makeChallengeCookie, validChallengeCookie, proxyChallenge, verifyChallenge };
