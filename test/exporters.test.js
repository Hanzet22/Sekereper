'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCSV, toNDJSON, compareResults } = require('../src/services/exporters');
const { parseFeed } = require('../src/services/feed-parser');
const { parseSitemap, parseRobots } = require('../src/services/discovery-parser');

test('CSV escapes quotes and preserves commas', () => {
  assert.equal(toCSV([{title:'a,b',note:'say "hi"'}]), '"title","note"\r\n"a,b","say ""hi"""');
});
test('NDJSON emits one JSON object per line', () => {
  assert.equal(toNDJSON([{a:1},{b:2}]), '{"a":1}\n{"b":2}');
});
test('result comparison reports additions, removals and changes', () => {
  const diff = compareResults([{url:'a',data:{x:1}},{url:'b',data:{x:2}}],[{url:'a',data:{x:3}},{url:'c',data:{x:4}}]);
  assert.deepEqual(diff.summary,{added:1,removed:1,changed:1,unchanged:0});
});
test('RSS parser extracts bounded item metadata', () => {
  const result = parseFeed('<rss><channel><title>Demo</title><item><title>One</title><link>https://example.com</link></item></channel></rss>');
  assert.equal(result.type,'rss'); assert.equal(result.items[0].title,'One');
});
test('sitemap and robots parsers extract discovery hints', () => {
  assert.deepEqual(parseSitemap('<urlset><url><loc>https://example.com/</loc></url></urlset>').urls,['https://example.com/']);
  const robots = parseRobots('User-agent: *\nDisallow: /private\nSitemap: https://example.com/sitemap.xml');
  assert.equal(robots.groups[0].rules[0].path,'/private');
  assert.equal(robots.sitemaps[0],'https://example.com/sitemap.xml');
});


test('CSV neutralizes spreadsheet formula injection while preserving ordinary values', () => {
  const csv = toCSV([
    { value: '=1+1' },
    { value: '+SUM(A1:A2)' },
    { value: '  =HYPERLINK("https://example.com")' },
    { value: '@cmd' },
    { value: '\t=1+1' },
    { value: 'ordinary text' },
    { value: 'quoted "text"' },
  ]);
  assert.match(csv, /"'=1\\+1"/);
  assert.match(csv, /"'\\+SUM\\(A1:A2\\)"/);
  assert.match(csv, /"'  =HYPERLINK\\(""https:\/\/example\\.com""\\)"/);
  assert.match(csv, /"'@cmd"/);
  assert.match(csv, /"'\\t=1\\+1"/);
  assert.match(csv, /"ordinary text"/);
  assert.match(csv, /"quoted ""text"""/);
});
