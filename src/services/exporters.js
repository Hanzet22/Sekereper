'use strict';

function csvCell(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Spreadsheet cells beginning with formula operators (possibly after control/space
  // characters) must be treated as text to prevent CSV formula injection.
  const safeText = /^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)
    ? "'" + text
    : text;
  return '"' + safeText.replace(/"/g, '""') + '"';
}
function toCSV(rows) {
  const records = Array.isArray(rows) ? rows : [];
  const columns = [...new Set(records.flatMap(row => Object.keys(row || {})))];
  if (!columns.length) return '';
  return [columns.map(csvCell).join(','), ...records.map(row => columns.map(key => csvCell(row?.[key])).join(','))].join('\r\n');
}
function toNDJSON(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => JSON.stringify(row)).join('\n');
}
function flattenResult(result) {
  const data = result?.data || {};
  return {
    url: result?.url || data?.meta?.url || '',
    success: result?.success ?? true,
    title: data?.meta?.title || '',
    description: data?.meta?.description || '',
    scrapedAt: data?.meta?.scrapedAt || '',
    headingCount: data?.stats?.headingCount ?? 0,
    paragraphCount: data?.stats?.paragraphCount ?? 0,
    linkCount: data?.stats?.linkCount ?? 0,
    imageCount: data?.stats?.imageCount ?? 0,
    tableCount: data?.stats?.tableCount ?? 0,
    error: result?.error || '',
  };
}
function compareResults(previous, current) {
  const key = item => item?.url || item?.data?.meta?.url || '';
  const before = new Map((Array.isArray(previous) ? previous : []).map(item => [key(item), item]));
  const after = new Map((Array.isArray(current) ? current : []).map(item => [key(item), item]));
  const added = [], removed = [], changed = [];
  for (const [url, item] of after) {
    if (!before.has(url)) added.push({url,item});
    else if (JSON.stringify(before.get(url)?.data || before.get(url)) !== JSON.stringify(item?.data || item)) changed.push({url,before:before.get(url),after:item});
  }
  for (const [url, item] of before) if (!after.has(url)) removed.push({url,item});
  return {summary:{added:added.length,removed:removed.length,changed:changed.length,unchanged:Math.max(0,before.size-changed.length-removed.length)},added,removed,changed};
}
module.exports = { toCSV, toNDJSON, flattenResult, compareResults };
