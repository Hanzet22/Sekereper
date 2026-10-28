'use strict';

const dns = require('node:dns/promises');
const https = require('node:https');
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

// Query DNS-over-HTTPS by connecting to the resolver's IP directly. This avoids
// needing working OS/c-ares DNS just to reach the fallback resolver.
function queryDoh(hostname, type, provider) {
  return new Promise((resolve, reject) => {
    const path = provider.name === 'cloudflare'
      ? '/dns-query?name=' + encodeURIComponent(hostname) + '&type=' + type
      : '/resolve?name=' + encodeURIComponent(hostname) + '&type=' + type;
    const request = https.request({
      hostname: provider.ip,
      servername: provider.host,
      path,
      method: 'GET',
      headers: {
        host: provider.host,
        accept: provider.name === 'cloudflare' ? 'application/dns-json' : 'application/dns-json',
        'user-agent': 'HANZET-SCRAPER/3.5 DNS fallback',
      },
      timeout: 4500,
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 65536) {
          request.destroy(new Error('DNS-over-HTTPS response too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(provider.name + ' DoH returned HTTP ' + response.statusCode));
          return;
        }
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const wantedType = type === 'A' ? 1 : 28;
          const records = (body.Answer || [])
            .filter(record => record.type === wantedType && net.isIP(record.data) === (type === 'A' ? 4 : 6))
            .map(record => ({ address: record.data, family: type === 'A' ? 4 : 6 }));
          resolve(records);
        } catch (error) {
          reject(error);
        }
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error(provider.name + ' DoH timed out')));
    request.on('error', reject);
    request.end();
  });
}

async function resolveDoh(hostname, type) {
  const providers = [
    { name: 'cloudflare', ip: '1.1.1.1', host: 'cloudflare-dns.com' },
    { name: 'google', ip: '8.8.8.8', host: 'dns.google' },
  ];
  const errors = [];
  for (const provider of providers) {
    try {
      const records = await queryDoh(hostname, type, provider);
      if (records.length) return records;
      // An empty successful answer is authoritative; try the other provider
      // in case the first resolver returned a transient/incomplete response.
      errors.push(provider.name + ': no ' + type + ' records');
    } catch (error) {
      errors.push(provider.name + ': ' + (error.code || error.message));
    }
  }
  throw new Error(errors.join('; '));
}

// Prefer the native Node resolver. If it cannot resolve anything (common in
// restricted Android/PRoot DNS setups), retry through DNS-over-HTTPS by IP.
// SSRF validation is still applied to every returned address by validateTarget.
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
  if (records.length) return records;

  // dns.resolve* talks to configured DNS servers directly. Some container,
  // Android/PRoot, and hosting environments only support the OS getaddrinfo path.
  // Try that independent resolver before making outbound DoH requests.
  const systemLookup = await new Promise(resolve => {
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) resolve({ error });
      else resolve({ addresses });
    });
  });
  if (systemLookup.addresses?.length) {
    return systemLookup.addresses.map(record => ({
      address: record.address,
      family: record.family,
    }));
  }

  const dohResults = await Promise.allSettled([
    resolveDoh(hostname, 'A'),
    resolveDoh(hostname, 'AAAA'),
  ]);
  for (let i = 0; i < dohResults.length; i++) {
    const result = dohResults[i];
    if (result.status === 'fulfilled') records.push(...result.value);
  }
  if (records.length) return records;

  const reasons = [
    ...results.filter(result => result.status === 'rejected')
      .map(result => result.reason?.code || result.reason?.message),
    systemLookup.error?.code || systemLookup.error?.message,
    ...dohResults.filter(result => result.status === 'rejected')
      .map(result => result.reason?.message),
  ].filter(Boolean);
  const error = new Error('DNS lookup failed after native DNS, system lookup, and DNS-over-HTTPS: ' +
    [...new Set(reasons)].join(' | '));
  error.code = 'ENOTFOUND';
  throw error;
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
    try { records = await resolveHostname(hostname); }
    catch (error) {
      throw new Error('Target hostname could not be resolved (' + (error.message || error.code) + ')');
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
