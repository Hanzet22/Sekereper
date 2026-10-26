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

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error('Private, loopback, or reserved IP targets are not allowed');
    url._publicAddresses = [hostname];
  } else {
    let records;
    try { records = await dns.lookup(hostname, { all: true, verbatim: true }); }
    catch { throw new Error('Target hostname could not be resolved'); }
    if (!records.length || records.some(record => !isPublicAddress(record.address))) {
      throw new Error('Target resolves to a private, loopback, or reserved IP address');
    }
    url._publicAddresses = records.map(record => record.address);
  }
  url.hash = '';
  return url;
}

module.exports = { validateTarget, isPublicAddress };
