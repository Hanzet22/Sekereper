/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  HANZET-SCRAPER — Rate Limiter Middleware  v1.0         ║
 * ║  Node.js Custom Token Bucket Implementation             ║
 * ║  Layer 1 of 2 — before Bucket4j (Java/JVM)             ║
 * ║  Author: Farhan (海鹏 鸟神 / Hanzet22)                   ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * DEPRECATED: historical V2 reference only; do not wire into V3.\n * Algorithm: Token Bucket (sliding window per IP + per endpoint)
 * Layer 1: Node.js — catches floods, DDoS, IP spam
 * Layer 2: Bucket4j (Java) — per-user quota, API key limits
 */

'use strict';

// ─── TOKEN BUCKET STORE ─────────────────────────────────────
// In-memory store — ganti Redis kalau mau distributed
const buckets = new Map();

/**
 * Get or create bucket for a key
 * @param {string} key       — biasanya IP atau IP+endpoint
 * @param {number} capacity  — max tokens
 * @param {number} refillRate — tokens per second
 */
function getBucket(key, capacity, refillRate) {
  const now = Date.now();

  if (!buckets.has(key)) {
    buckets.set(key, {
      tokens    : capacity,
      capacity,
      refillRate,
      lastRefill: now,
      totalHits : 0,
      blocked   : 0,
    });
  }

  const bucket = buckets.get(key);

  // Refill tokens berdasarkan waktu yang berlalu
  const elapsed      = (now - bucket.lastRefill) / 1000; // detik
  const tokensToAdd  = elapsed * bucket.refillRate;
  bucket.tokens      = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
  bucket.lastRefill  = now;

  return bucket;
}

/**
 * Consume 1 token — return true kalau allowed, false kalau blocked
 */
function consumeToken(key, capacity, refillRate) {
  const bucket = getBucket(key, capacity, refillRate);
  bucket.totalHits++;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }

  bucket.blocked++;
  return false;
}

// ─── CLEANUP — hapus bucket lama tiap 5 menit ───────────────
setInterval(() => {
  const now     = Date.now();
  const expired = 5 * 60 * 1000; // 5 menit
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.lastRefill > expired) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ─── RATE LIMIT CONFIGS PER ENDPOINT ───────────────────────
const LIMITS = {
  // Global per-IP default
  default: { capacity: 60,  refillRate: 1    }, // 60 req/menit

  // Endpoint-specific
  '/scrape':       { capacity: 10,  refillRate: 0.17 }, // 10 req/menit
  '/scrape/batch': { capacity: 3,   refillRate: 0.05 }, // 3 req/menit
  '/health':       { capacity: 120, refillRate: 2    }, // 120 req/menit
  '/api/jvm':      { capacity: 20,  refillRate: 0.33 }, // 20 req/menit
};

// ─── IP EXTRACTOR ───────────────────────────────────────────
function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// ─── WHITELIST ──────────────────────────────────────────────
const WHITELIST = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);

// ─── BLOCKLIST (manual ban) ─────────────────────────────────
const BLOCKLIST = new Set();

// ─── MAIN MIDDLEWARE ────────────────────────────────────────
function rateLimiter(req, res, next) {
  const ip       = getIP(req);
  const endpoint = req.path;
  const method   = req.method;

  // Whitelist bypass
  if (WHITELIST.has(ip)) return next();

  // Blocklist hard reject
  if (BLOCKLIST.has(ip)) {
    return res.status(403).json({
      error     : 'Forbidden — IP blocked',
      ip,
      retryAfter: null,
    });
  }

  // Pilih config limit
  const config = LIMITS[endpoint] || LIMITS.default;

  // Key: IP + endpoint biar per-route
  const key    = `${ip}:${endpoint}`;
  const allowed = consumeToken(key, config.capacity, config.refillRate);

  // Set rate limit headers (kayak standard API)
  const bucket   = getBucket(key, config.capacity, config.refillRate);
  res.setHeader('X-RateLimit-Limit',     config.capacity);
  res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens));
  res.setHeader('X-RateLimit-Policy',    `${config.capacity};w=60`);

  if (!allowed) {
    const retryAfter = Math.ceil((1 - bucket.tokens) / config.refillRate);
    res.setHeader('Retry-After', retryAfter);

    console.warn(`[RATE-LIMIT] BLOCKED ${ip} → ${method} ${endpoint} | tokens=${bucket.tokens.toFixed(2)} | blocked=${bucket.blocked}`);

    return res.status(429).json({
      error      : 'Too Many Requests — slow down bung!',
      ip,
      endpoint,
      retryAfter : `${retryAfter}s`,
      blocked    : bucket.blocked,
    });
  }

  console.log(`[RATE-LIMIT] OK ${ip} → ${method} ${endpoint} | tokens=${bucket.tokens.toFixed(2)}`);
  next();
}

// ─── ADMIN TOOLS ────────────────────────────────────────────
function getBucketStats() {
  const stats = {};
  for (const [key, bucket] of buckets.entries()) {
    stats[key] = {
      tokens    : +bucket.tokens.toFixed(2),
      capacity  : bucket.capacity,
      totalHits : bucket.totalHits,
      blocked   : bucket.blocked,
      blockRate : bucket.totalHits
        ? ((bucket.blocked / bucket.totalHits) * 100).toFixed(1) + '%'
        : '0%',
    };
  }
  return stats;
}

function blockIP(ip)   { BLOCKLIST.add(ip);    return `Blocked: ${ip}`;   }
function unblockIP(ip) { BLOCKLIST.delete(ip); return `Unblocked: ${ip}`; }
function resetBucket(key) { buckets.delete(key); return `Reset: ${key}`; }

module.exports = {
  rateLimiter,
  getBucketStats,
  blockIP,
  unblockIP,
  resetBucket,
  WHITELIST,
  BLOCKLIST,
};
