'use strict';

const express = require('express');
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { config } = require('./config');
const { rateLimit } = require('./middleware/rate-limit');
const { scrape } = require('./services/scraper');

function constantTimeTokenMatch(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(rateLimit);

  app.get('/health', (_req, res) => res.json({
    status: 'ok', version: '3.0.0',
    capabilities: { static: true, dynamic: true, batch: true },
    security: { publicHttpTargetsOnly: true, adminDisabled: !config.adminToken },
  }));

  app.post('/scrape', async (req, res) => {
    const { url, mode = 'static' } = req.body || {};
    if (typeof url !== 'string' || url.length > 2048) return res.status(400).json({ error: 'url must be a string up to 2048 characters' });
    if (!['static', 'dynamic'].includes(mode)) return res.status(400).json({ error: 'mode must be "static" or "dynamic"' });
    const jobId = randomUUID();
    const started = Date.now();
    try {
      const data = await scrape(url, mode);
      return res.json({ success: true, jobId, elapsedMs: Date.now() - started, mode, data });
    } catch (error) {
      const status = /private|internal|credentials|protocol|hostname|URL|port|redirect|resolved|HTTP [45]|HTML|size limit/i.test(error.message) ? 400 : 502;
      return res.status(status).json({ success: false, jobId, error: error.message || 'Scrape failed' });
    }
  });

  app.post('/scrape/batch', async (req, res) => {
    const { urls, mode = 'static' } = req.body || {};
    if (!Array.isArray(urls) || urls.length < 1 || urls.length > config.maxBatchSize ||
        urls.some(url => typeof url !== 'string' || url.length > 2048)) {
      return res.status(400).json({ error: `urls must contain 1-${config.maxBatchSize} URL strings (max 2048 chars each)` });
    }
    if (!['static', 'dynamic'].includes(mode)) return res.status(400).json({ error: 'mode must be "static" or "dynamic"' });
    const results = new Array(urls.length);
    let next = 0;
    async function worker() {
      while (true) {
        const index = next++;
        if (index >= urls.length) return;
        try { results[index] = { url: urls[index], success: true, data: await scrape(urls[index], mode) }; }
        catch (error) { results[index] = { url: urls[index], success: false, error: error.message || 'Scrape failed' }; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(config.maxConcurrentJobs, urls.length) }, worker));
    res.json({ success: results.every(r => r.success), count: results.length, results });
  });

  function requireAdmin(req, res, next) {
    if (!config.adminToken) return res.status(503).json({ error: 'Admin API is disabled: configure ADMIN_TOKEN to enable it' });
    if (!constantTimeTokenMatch(req.get('x-admin-token'), config.adminToken)) return res.status(401).json({ error: 'Unauthorized' });
    next();
  }
  app.get('/admin/stats', requireAdmin, (_req, res) => res.json({
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    node: process.version,
  }));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Invalid JSON body' });
    console.error('[HANZET-SCRAPER] Unhandled request error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

module.exports = { createApp };
