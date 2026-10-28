'use strict';

const express = require('express');
const path = require('node:path');
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { config } = require('./config');
const { rateLimit } = require('./middleware/rate-limit');
const { scrape } = require('./services/scraper');
const { createCrawlJob, listJobs, getJob, controlJob, getResults, publicJob } = require('./services/job-manager');
const { toCSV, toNDJSON, flattenResult, compareResults } = require('./services/exporters');
const { listAdapters } = require('./plugins');
const { parseFeed } = require('./services/feed-parser');
const { parseSitemap, parseRobots } = require('./services/discovery-parser');

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
    res.setHeader('X-Frame-Options', 'DENY');
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

  // Serve only the HTML5 entry point and dedicated frontend assets.
  // Do not expose the repository root, which contains source and configuration files.
  const projectRoot = path.resolve(__dirname, '..');
  app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(projectRoot, 'index.html')));
  app.use('/ui', express.static(path.join(projectRoot, 'ui'), {
    dotfiles: 'deny', index: false, fallthrough: true,
    maxAge: config.nodeEnv === 'production' ? '1h' : 0,
  }));

  app.use(rateLimit);

  app.get('/health', (_req, res) => res.json({
    status: 'ok', version: '3.5.0',
    capabilities: { static: true, dynamic: true, batch: true, crawlJobs: true, export: ['json','csv','ndjson'], feeds: ['rss','atom'], adapters: true, compare: true },
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

  // Long-running bounded crawler. Jobs are in-memory; restart clears the queue and history.
  app.post('/crawl/jobs', async (req, res) => {
    const { urls, mode = 'static', maxPages = 25, maxDepth = 2, sameOrigin = true, domainDelayMs = 500 } = req.body || {};
    if (typeof sameOrigin !== 'boolean') return res.status(400).json({ error: 'sameOrigin must be a boolean' });
    try {
      const job = await createCrawlJob({ urls, mode, maxPages, maxDepth, sameOrigin, domainDelayMs });
      return res.status(202).json({ success: true, job });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Invalid crawl job' });
    }
  });
  app.get('/crawl/jobs', (_req, res) => res.json({ jobs: listJobs() }));
  app.get('/crawl/jobs/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ job: publicJob(job) });
  });
  app.post('/crawl/jobs/:id/:action', (req, res) => {
    if (!['pause','resume','cancel'].includes(req.params.action)) return res.status(400).json({ error: 'Action must be pause, resume, or cancel' });
    const job = controlJob(req.params.id, req.params.action);
    if (!job) return res.status(404).json({ error: 'Job not found or action invalid for this job' });
    res.json({ success: true, job });
  });
  app.get('/crawl/jobs/:id/results', (req, res) => {
    const output = getResults(req.params.id);
    if (!output) return res.status(404).json({ error: 'Job not found' });
    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'csv') {
      res.type('text/csv; charset=utf-8');
      return res.send(toCSV(output.results.map(flattenResult)));
    }
    if (format === 'ndjson') {
      res.type('application/x-ndjson; charset=utf-8');
      return res.send(toNDJSON(output.results));
    }
    if (format !== 'json') return res.status(400).json({ error: 'format must be json, csv, or ndjson' });
    res.json(output);
  });

  app.post('/compare', (req, res) => {
    const { previous, current } = req.body || {};
    if (!Array.isArray(previous) || !Array.isArray(current) || previous.length > 1000 || current.length > 1000) {
      return res.status(400).json({ error: 'previous and current must be arrays with at most 1000 entries each' });
    }
    res.json(compareResults(previous, current));
  });
  app.get('/adapters', (_req, res) => res.json({ adapters: listAdapters() }));
  app.post('/parse/sitemap', (req, res) => {
    const { xml } = req.body || {};
    if (typeof xml !== 'string') return res.status(400).json({ error: 'xml must be a string' });
    try { return res.json({ success: true, data: parseSitemap(xml) }); }
    catch (error) { return res.status(400).json({ success: false, error: error.message || 'Sitemap parse failed' }); }
  });
  app.post('/parse/robots', (req, res) => {
    const { text } = req.body || {};
    if (typeof text !== 'string') return res.status(400).json({ error: 'text must be a string' });
    try { return res.json({ success: true, data: parseRobots(text) }); }
    catch (error) { return res.status(400).json({ success: false, error: error.message || 'robots.txt parse failed' }); }
  });
  app.post('/parse/feed', (req, res) => {
    const { xml } = req.body || {};
    if (typeof xml !== 'string') return res.status(400).json({ error: 'xml must be a string' });
    try { return res.json({ success: true, data: parseFeed(xml) }); }
    catch (error) { return res.status(400).json({ success: false, error: error.message || 'Feed parse failed' }); }
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
    crawlJobs: listJobs().length,
  }));

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large' || error?.status === 413 || error?.statusCode === 413) {
      return res.status(413).json({ error: 'Request body exceeds the 32kb limit' });
    }
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Invalid JSON body' });
    console.error('[HANZET-SCRAPER] Unhandled request error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
module.exports = { createApp };
