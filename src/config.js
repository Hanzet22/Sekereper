'use strict';

function positiveInt(name, fallback, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid ${name}: expected integer from 1 to ${max}`);
  }
  return value;
}

const config = Object.freeze({
  host: process.env.HOST || '127.0.0.1',
  port: positiveInt('PORT', 3131, 65535),
  nodeEnv: process.env.NODE_ENV || 'development',
  adminToken: process.env.ADMIN_TOKEN || '',
  corsOrigins: (process.env.CORS_ORIGINS === undefined
    ? 'http://127.0.0.1:3000,http://localhost:3000'
    : process.env.CORS_ORIGINS)
    .split(',').map(v => v.trim()).filter(Boolean),
  requestTimeoutMs: positiveInt('REQUEST_TIMEOUT_MS', 15000, 120000),
  maxResponseBytes: positiveInt('MAX_RESPONSE_BYTES', 3000000, 20000000),
  maxBatchSize: positiveInt('MAX_BATCH_SIZE', 5, 10),
  maxConcurrentJobs: positiveInt('MAX_CONCURRENT_JOBS', 3, 10),
  maxRedirects: positiveInt('MAX_REDIRECTS', 3, 5),
});

module.exports = { config };
