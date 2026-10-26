'use strict';

const buckets = new Map();
const WINDOW_MS = 60_000;
const LIMIT = 30;
const MAX_KEYS = 10_000;

function rateLimit(req, res, next) {
  const now = Date.now();
  const forwarded = req.socket.remoteAddress || 'unknown';
  const key = `${forwarded}:${req.path}`;
  let entry = buckets.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (now - v.start >= WINDOW_MS) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) return res.status(503).json({ error: 'Rate limiter capacity reached' });
    }
    entry = { start: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  res.setHeader('RateLimit-Limit', LIMIT);
  res.setHeader('RateLimit-Remaining', Math.max(0, LIMIT - entry.count));
  res.setHeader('RateLimit-Reset', Math.ceil((entry.start + WINDOW_MS) / 1000));
  if (entry.count > LIMIT) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.start + WINDOW_MS - now) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
}

module.exports = { rateLimit };
