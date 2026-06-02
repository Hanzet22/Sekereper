/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  HANZET-SCRAPER — Main Server  v2.0                    ║
 * ║  Node.js + Express + Cheerio + Playwright + Tor        ║
 * ║  + Custom Rate Limiter (Layer 1)                       ║
 * ║  + Bucket4j Bridge (Layer 2 → JVM :8080)              ║
 * ║  Author: Farhan (海鹏 鸟神 / Hanzet22)                   ║
 * ╚══════════════════════════════════════════════════════════╝
 */

'use strict';

const express      = require('express');
const cors         = require('cors');
const cheerio      = require('cheerio');
const axios        = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { chromium } = require('playwright');
const {
  rateLimiter,
  getBucketStats,
  blockIP,
  unblockIP,
  resetBucket,
} = require('./middleware/rateLimiter');

const app  = express();
const PORT = 3131;
const JVM_PORT = 8080; // Bucket4j JVM server
const TAG  = '[HANZET-SCRAPER]';

// ─── MIDDLEWARE ────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── LAYER 1: Node.js Rate Limiter ─────────────────────────
app.use(rateLimiter);

// ─── LAYER 2: Bucket4j Bridge ───────────────────────────────
// Forward check ke JVM setelah Layer 1 lolos
async function bucket4jCheck(req, res, next) {
  const ip     = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  const apiKey = req.headers['x-api-key'] || '';

  try {
    const jvmRes = await axios.post(`http://localhost:${JVM_PORT}/ratelimit/check`, {
      userKey : ip,
      apiKey  : apiKey,
      endpoint: req.path,
    }, { timeout: 2000 });

    // Set remaining header dari JVM
    res.setHeader('X-Bucket4j-Remaining', jvmRes.data.remaining || 0);

    if (!jvmRes.data.allowed) {
      return res.status(429).json({
        error     : 'Too Many Requests — Bucket4j Layer',
        reason    : jvmRes.data.reason,
        retryAfter: jvmRes.data.retryAfterMs
          ? `${Math.ceil(jvmRes.data.retryAfterMs / 1000)}s`
          : 'unknown',
      });
    }

    next();

  } catch (err) {
    // JVM server down → fail open (jangan block user)
    console.warn(`${TAG} [WARN] Bucket4j unreachable — fail open: ${err.message}`);
    next();
  }
}

// Apply bucket4j check ke scrape endpoints
app.use('/scrape', bucket4jCheck);

// ─── TOR AGENT ─────────────────────────────────────────────
const TOR_PROXY = 'socks5h://127.0.0.1:9050';
const torAgent  = new SocksProxyAgent(TOR_PROXY);

function makeTorAxios() {
  return axios.create({
    httpAgent : torAgent,
    httpsAgent: torAgent,
    timeout   : 30000,
    headers   : {
      'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
}

// ─── LOGGER ────────────────────────────────────────────────
function log(level, msg) {
  console.log(`${TAG} [${level}] ${new Date().toISOString()} — ${msg}`);
}

// ─── SCRAPE ENGINE ─────────────────────────────────────────
async function scrapeStatic(url, useTor) {
  log('INFO', `Static: ${url} | tor=${useTor}`);
  const client   = useTor ? makeTorAxios() : axios.create({ timeout: 30000 });
  const response = await client.get(url);
  return extractData(cheerio.load(response.data), url, response.data);
}

async function scrapeDynamic(url, useTor) {
  log('INFO', `Dynamic: ${url} | tor=${useTor}`);
  const launchOpts = { headless: true };
  if (useTor) launchOpts.args = ['--proxy-server=socks5://127.0.0.1:9050'];

  const browser = await chromium.launch(launchOpts);
  const page    = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0' });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  const html = await page.content();
  await browser.close();
  return extractData(cheerio.load(html), url, html);
}

function extractData($, url, rawHtml) {
  const headings   = [];
  const paragraphs = [];
  const links      = [];
  const images     = [];
  const tables     = [];
  const og         = {};
  const jsonLd     = [];

  $('h1,h2,h3,h4,h5,h6').each((_, el) =>
    headings.push({ tag: el.tagName, text: $(el).text().trim() }));

  $('p').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 20) paragraphs.push(t);
  });

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.startsWith('#'))
      links.push({ href, text: $(el).text().trim().substring(0, 100) });
  });

  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    if (src) images.push({ src, alt: $(el).attr('alt') || '' });
  });

  $('table').each((i, table) => {
    const rows = [];
    $(table).find('tr').each((_, tr) => {
      const cells = [];
      $(tr).find('td,th').each((_, td) => cells.push($(td).text().trim()));
      if (cells.length) rows.push(cells);
    });
    if (rows.length) tables.push({ tableIndex: i, rows });
  });

  $('meta[property^="og:"]').each((_, el) => {
    og[$(el).attr('property').replace('og:', '')] = $(el).attr('content') || '';
  });

  $('script[type="application/ld+json"]').each((_, el) => {
    try { jsonLd.push(JSON.parse($(el).html())); } catch (_) {}
  });

  return {
    meta: {
      url,
      title      : $('title').text().trim(),
      description: $('meta[name="description"]').attr('content') || '',
      keywords   : $('meta[name="keywords"]').attr('content') || '',
      canonical  : $('link[rel="canonical"]').attr('href') || '',
      scrapedAt  : new Date().toISOString(),
    },
    og,
    headings,
    paragraphs : paragraphs.slice(0, 50),
    links      : links.slice(0, 100),
    images     : images.slice(0, 50),
    tables,
    jsonLd,
    stats: {
      headingCount  : headings.length,
      paragraphCount: paragraphs.length,
      linkCount     : links.length,
      imageCount    : images.length,
      tableCount    : tables.length,
      htmlSize      : rawHtml.length,
    },
  };
}

// ─── ROUTES ────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({
  status : 'ok',
  version: '2.0',
  layers : {
    layer1: 'Node.js Token Bucket Middleware',
    layer2: `Bucket4j JVM @ localhost:${JVM_PORT}`,
  },
  tor: TOR_PROXY,
}));

app.post('/scrape', async (req, res) => {
  const { url, mode = 'static', tor = false } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try { new URL(url); } catch (_) {
    return res.status(400).json({ error: 'invalid url' });
  }

  const t0 = Date.now();
  try {
    const data    = mode === 'dynamic'
      ? await scrapeDynamic(url, tor)
      : await scrapeStatic(url, tor);
    const elapsed = Date.now() - t0;
    log('OK', `Done ${elapsed}ms: ${url}`);
    res.json({ success: true, elapsed, mode, tor, data });
  } catch (err) {
    log('ERROR', `${url} — ${err.message}`);
    res.status(500).json({ success: false, error: err.message, url });
  }
});

app.post('/scrape/batch', async (req, res) => {
  const { urls = [], mode = 'static', tor = false } = req.body;
  if (!urls.length) return res.status(400).json({ error: 'urls required' });
  if (urls.length > 10) return res.status(400).json({ error: 'max 10 urls' });

  const results = await Promise.allSettled(
    urls.map(url => mode === 'dynamic' ? scrapeDynamic(url, tor) : scrapeStatic(url, tor))
  );

  res.json({
    success: true,
    count  : urls.length,
    results: results.map((r, i) => ({
      url    : urls[i],
      success: r.status === 'fulfilled',
      data   : r.status === 'fulfilled' ? r.value : null,
      error  : r.status === 'rejected'  ? r.reason.message : null,
    })),
  });
});

// ─── ADMIN ROUTES ───────────────────────────────────────────
app.get('/admin/stats',          (req, res) => res.json(getBucketStats()));
app.post('/admin/block',         (req, res) => res.json({ result: blockIP(req.body.ip) }));
app.post('/admin/unblock',       (req, res) => res.json({ result: unblockIP(req.body.ip) }));
app.post('/admin/reset',         (req, res) => res.json({ result: resetBucket(req.body.key) }));

// ─── START ─────────────────────────────────────────────────
app.listen(PORT, () => {
  log('INIT', `Server v2.0 @ http://localhost:${PORT}`);
  log('INIT', `Layer 1: Node.js Token Bucket Middleware`);
  log('INIT', `Layer 2: Bucket4j JVM @ http://localhost:${JVM_PORT}`);
  log('INIT', `Tor: ${TOR_PROXY}`);
});
