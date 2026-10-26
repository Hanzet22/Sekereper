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
function parseRobots(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1_000_000) throw new Error('robots.txt input must be text up to 1 MB');
  const groups = [];
  let group = {agents:[],rules:[],sitemaps:[]};
  let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0,colon).trim().toLowerCase();
    const value = line.slice(colon+1).trim();
    if (key === 'user-agent') {
      if (hasRules || group.agents.length) { if (group.agents.length || group.rules.length || group.sitemaps.length) groups.push(group); group = {agents:[],rules:[],sitemaps:[]}; hasRules=false; }
      group.agents.push(value.slice(0,200));
    } else if (key === 'allow' || key === 'disallow') {
      group.rules.push({type:key,path:value.slice(0,2048)}); hasRules=true;
    } else if (key === 'sitemap' && value) group.sitemaps.push(value.slice(0,2048));
  }
  if (group.agents.length || group.rules.length || group.sitemaps.length) groups.push(group);
  return {groups, sitemaps:[...new Set(groups.flatMap(g=>g.sitemaps))]};
}
module.exports = { parseSitemap, parseRobots };
