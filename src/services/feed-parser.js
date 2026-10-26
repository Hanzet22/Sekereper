'use strict';

const cheerio = require('cheerio');
function parseFeed(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > 3_000_000) throw new Error('Feed input must be text up to 3 MB');
  const $ = cheerio.load(xml, { xmlMode: true });
  const root = $('rss channel').first();
  const atom = $('feed').first();
  const source = root.length ? root : atom;
  if (!source.length) throw new Error('Unsupported or invalid RSS/Atom feed');
  const isAtom = atom.length > 0;
  const selector = isAtom ? 'entry' : 'item';
  const items = source.find(selector).slice(0, 500).map((_, el) => {
    const node = $(el);
    const link = isAtom ? (node.find('link[rel="alternate"]').attr('href') || node.find('link').attr('href') || '') : node.children('link').first().text().trim();
    return {
      title: node.children('title').first().text().trim().slice(0, 1000),
      link: link.slice(0, 2048),
      id: (node.children('guid').first().text() || node.children('id').first().text()).trim().slice(0, 1000),
      published: (node.children('pubDate').first().text() || node.children('published').first().text() || node.children('updated').first().text()).trim().slice(0, 200),
      summary: (node.children('description').first().text() || node.children('summary').first().text() || node.children('content').first().text()).trim().slice(0, 3000),
    };
  }).get();
  return {type:isAtom ? 'atom' : 'rss',title:source.children('title').first().text().trim().slice(0,500),items};
}
module.exports = { parseFeed };
