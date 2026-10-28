'use strict';

const cheerio = require('cheerio');
function parseSitemap(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > 3_000_000) throw new Error('Sitemap input must be text up to 3 MB');
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = $('urlset > url > loc').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 5000);
  const sitemaps = $('sitemapindex > sitemap > loc').map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 500);
  if (!urls.length && !sitemaps.length) throw new Error('No sitemap URLs found');
  return {type:sitemaps.length ? 'sitemap-index' : 'urlset',urls,sitemaps};
}
module.exports = { parseSitemap };
