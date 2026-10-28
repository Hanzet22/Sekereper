'use strict';

const https = require('node:https');
const http = require('node:http');
const net = require('node:net');
const cheerio = require('cheerio');
const { chromium: playwrightChromium } = require('playwright-core');
const serverlessChromium = require('@sparticuz/chromium');
const { config } = require('../config');
const { validateTarget, isPublicAddress, resolveHostname } = require('../security/url-policy');

function safeLookup(hostname, options, callback) {
  resolveHostname(hostname).then(records => {
    if (!records.length || records.some(r => !isPublicAddress(r.address))) {
      return callback(new Error('Target resolved to a non-public address'));
    }
    const family = typeof options === 'object' && options.family ? options.family : 0;
    const selected = family ? records.find(r => r.family === family) : records[0];
    if (!selected) return callback(new Error('No compatible public address'));
    if (typeof options === 'object' && options.all) return callback(null, records);
    callback(null, selected.address, selected.family);
  }).catch(callback);
}

function extractData(html, url) {
  const $ = cheerio.load(html);
  const headings = $('h1,h2,h3,h4,h5,h6').slice(0, 100).map((_, el) => ({
    tag: el.tagName, text: $(el).text().trim().slice(0, 500),
  })).get();
  const paragraphs = $('p').slice(0, 100).map((_, el) => $(el).text().trim().slice(0, 1500))
    .get().filter(text => text.length > 20);
  const links = $('a[href]').slice(0, 200).map((_, el) => ({
    href: $(el).attr('href'), text: $(el).text().trim().slice(0, 200),
  })).get();
  const images = $('img').slice(0, 100).map((_, el) => ({
    src: $(el).attr('src') || $(el).attr('data-src') || '',
    alt: ($(el).attr('alt') || '').slice(0, 300),
  })).get().filter(image => image.src);
  const tables = $('table').slice(0, 20).map((i, table) => ({
    tableIndex: i,
    rows: $(table).find('tr').slice(0, 50).map((_, tr) =>
      [$(tr).find('th,td').slice(0, 20).map((_, cell) => $(cell).text().trim().slice(0, 500)).get()]
    ).get(),
  })).get();
  const og = {};
  $('meta[property^="og:"]').slice(0, 30).each((_, el) => {
    og[$(el).attr('property').replace('og:', '')] = ($(el).attr('content') || '').slice(0, 1000);
  });
  const jsonLd = [];
  $('script[type="application/ld+json"]').slice(0, 20).each((_, el) => {
    try { jsonLd.push(JSON.parse($(el).text().slice(0, 100_000))); } catch {}
  });
  return {
    meta: {
      url, title: $('title').text().trim().slice(0, 500),
      description: ($('meta[name="description"]').attr('content') || '').slice(0, 1000),
      canonical: ($('link[rel="canonical"]').attr('href') || '').slice(0, 2000),
      scrapedAt: new Date().toISOString(),
    },
    og, headings, paragraphs, links, images, tables, jsonLd,
    stats: { headingCount: headings.length, paragraphCount: paragraphs.length,
      linkCount: links.length, imageCount: images.length, tableCount: tables.length,
      htmlSize: Buffer.byteLength(html) },
  };
}

async function fetchStatic(inputUrl, signal) {
  let url = await validateTarget(inputUrl);
  for (let redirects = 0; redirects <= config.maxRedirects; redirects++) {
    if (signal?.aborted) throw new Error('Scrape cancelled');
    const transport = url.protocol === 'https:' ? https : http;
    const agent = url.protocol === 'https:'
      ? new https.Agent({ lookup: safeLookup, keepAlive: false })
      : new http.Agent({ lookup: safeLookup, keepAlive: false });
    const controller = new AbortController();
    let timedOut = false;
    if (signal?.aborted) throw new Error('Scrape cancelled');
    const onAbort = () => controller.abort(new Error('Scrape cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`Request timed out after ${config.requestTimeoutMs} ms`));
    }, config.requestTimeoutMs);
    try {
      const response = await new Promise((resolve, reject) => {
        const request = transport.request(url, {
          method: 'GET', agent, signal: controller.signal,
          headers: { 'User-Agent': 'HANZET-SCRAPER/3.0 (+respectful research client)', Accept: 'text/html,application/xhtml+xml;q=0.9' },
        }, resolve);
        request.on('error', reject);
        request.end();
      });
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        const location = response.headers.location;
        if (!location || redirects === config.maxRedirects) throw new Error('Redirect limit exceeded');
        url = await validateTarget(new URL(location, url).href);
        continue;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        throw new Error(`Target returned HTTP ${status}`);
      }
      const type = String(response.headers['content-type'] || '').toLowerCase();
      if (!(type.includes('text/html') || type.includes('application/xhtml+xml'))) {
        response.resume();
        throw new Error('Target did not return HTML');
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of response) {
        size += chunk.length;
        if (size > config.maxResponseBytes) {
          response.destroy();
          throw new Error('Target response exceeded configured size limit');
        }
        chunks.push(chunk);
      }
      return extractData(Buffer.concat(chunks).toString('utf8'), url.href);
    } catch (error) {
      if (timedOut) throw new Error(`Request timed out after ${config.requestTimeoutMs} ms`);
      if (signal?.aborted) throw new Error('Scrape cancelled');
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      agent.destroy();
    }
  }
  throw new Error('Redirect limit exceeded');
}

async function fetchDynamic(inputUrl, signal) {
  const startUrl = await validateTarget(inputUrl);
  // Pin the validated hostname to the already-checked address to reduce DNS-rebinding risk.
  // Dynamic mode intentionally stays same-origin; cross-origin subresources are blocked.
  const hostname = startUrl.hostname.startsWith('[') ? startUrl.hostname.slice(1, -1) : startUrl.hostname;
  const addresses = startUrl._publicAddresses || [];
  const pinnedAddress = addresses.find(address => net.isIP(address) === 4) || addresses[0];
  const resolverRule = !net.isIP(hostname) && pinnedAddress
    ? `--host-resolver-rules=MAP ${hostname} ${net.isIP(pinnedAddress) === 6 ? '[' + pinnedAddress + ']' : pinnedAddress},EXCLUDE localhost`
    : null;
  const configuredBrowser = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  let browser;

  try {
    // Use the Chromium binary bundled for serverless Linux environments such as Vercel.
    // Keep the existing validated-host resolver pin and all same-origin request guards.
    const executablePath = configuredBrowser || await serverlessChromium.executablePath();
    const args = [...serverlessChromium.args, ...(resolverRule ? [resolverRule] : [])];
    browser = await playwrightChromium.launch({
      headless: true,
      args,
      executablePath,
    });
  } catch (error) {
    const hint = configuredBrowser
      ? `The configured browser at "${configuredBrowser}" could not be launched.`
      : 'The bundled serverless Chromium binary could not be extracted or launched. Check the Vercel function runtime and deployment bundle.';
    throw new Error(`Dynamic scraping could not launch Chromium. ${hint} Original error: ${error.message}`);
  }
  let page;
  let abortPage;
  try {
    if (signal?.aborted) throw new Error('Scrape cancelled');
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    page = await context.newPage();
    abortPage = () => { page.close().catch(() => {}); };
    signal?.addEventListener('abort', abortPage, { once: true });
    page.setDefaultNavigationTimeout(config.requestTimeoutMs);
    page.setDefaultTimeout(config.requestTimeoutMs);
    let totalBytes = 0;
    await page.route('**/*', async route => {
      try {
        const requestUrl = route.request().url();
        if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:')) return route.continue();
        const parsedRequest = new URL(requestUrl);
        if (parsedRequest.origin !== startUrl.origin) return route.abort('blockedbyclient');
        await validateTarget(requestUrl);
        const resourceType = route.request().resourceType();
        if (['media', 'font'].includes(resourceType)) return route.abort();
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
    });
    page.on('response', response => {
      const length = Number(response.headers()['content-length'] || 0);
      totalBytes += Number.isFinite(length) ? length : 0;
      if (totalBytes > config.maxResponseBytes) page.close().catch(() => {});
    });
    await page.goto(startUrl.href, { waitUntil: 'domcontentloaded' });
    if (signal?.aborted) throw new Error('Scrape cancelled');
    if (totalBytes > config.maxResponseBytes) throw new Error('Page exceeded configured response size limit');
    const html = await page.content();
    if (Buffer.byteLength(html) > config.maxResponseBytes) throw new Error('Rendered HTML exceeded configured size limit');
    return extractData(html, page.url());
  } finally {
    if (abortPage) signal?.removeEventListener('abort', abortPage);
    await browser.close();
  }
}

async function scrape(inputUrl, mode = 'static', options = {}) {
  const { signal } = options;
  if (mode === 'static') return fetchStatic(inputUrl, signal);
  if (mode === 'dynamic') return fetchDynamic(inputUrl, signal);
  throw new Error('mode must be "static" or "dynamic"');
}

module.exports = { scrape, extractData };
