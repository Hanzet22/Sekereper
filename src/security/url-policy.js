'use strict';

const dns = require('node:dns/promises');
const net = require('node:net');
const ipaddr = require('ipaddr.js');

function isPublicAddress(address) {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
      return isPublicAddress(parsed.toIPv4Address().toString());
    }
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

// dns.lookup() uses the OS getaddrinfo path, which can fail in Android/PRoot
// environments even when Node's c-ares DNS resolver can resolve public hosts.
// Resolve A and AAAA records directly, then keep the existing SSRF checks.
async function resolveHostname(hostname) {
  const results = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
  ]);
  const records = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      const family = i === 0 ? 4 : 6;
      for (const address of result.value) records.push({ address, family });
    }
  }
  if (!records.length) {
    const reasons = results
      .filter(result => result.status === 'rejected')
      .map(result => result.reason?.code || result.reason?.message)
      .filter(Boolean);
    const error = new Error('DNS lookup failed' + (reasons.length ? ': ' + [...new Set(reasons)].join(', ') : ''));
    error.code = 'ENOTFOUND';
    throw error;
  }
  return records;
}

async function validateTarget(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed');
  if (url.username || url.password) throw new Error('URLs containing credentials are not allowed');
  if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname.endsWith('.local') || url.hostname.endsWith('.internal')) {
    throw new Error('Local and internal hosts are not allowed');
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new Error('Only standard HTTP/HTTPS ports are allowed');
  }

  const hostname = url.hostname.replace(/^\\[|\\]$/g, '').toLowerCase();
  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error('Private, loopback, or reserved IP targets are not allowed');
    url._publicAddresses = [hostname];
  } else {
    let records;
    try { records = await resolveHostname(hostname); }
    catch (error) {
      throw new Error('Target hostname could not be resolved (' + (error.code || error.message) + ')');
    }
    if (!records.length || records.some(record => !isPublicAddress(record.address))) {
      throw new Error('Target resolves to a private, loopback, or reserved IP address');
    }
    url._publicAddresses = records.map(record => record.address);
  }
  url.hash = '';
  return url;
}

module.exports = { validateTarget, isPublicAddress, resolveHostname };
