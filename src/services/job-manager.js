'use strict';

const { randomUUID } = require('node:crypto');
const { scrape } = require('./scraper');
const { validateTarget } = require('../security/url-policy');
const { config } = require('../config');

const jobs = new Map();
const MAX_STORED_JOBS = 100;
const MAX_PAGES_PER_JOB = 100;
const MAX_QUEUE_SIZE = 1000;
const MAX_DEPTH = 5;
const DEFAULT_DOMAIN_DELAY_MS = 500;
const MAX_DOMAIN_DELAY_MS = 5000;

function publicJob(job) {
  return {
    id: job.id, status: job.status, mode: job.mode, createdAt: job.createdAt,
    updatedAt: job.updatedAt, startedAt: job.startedAt, finishedAt: job.finishedAt,
    progress: { queued: job.queue.length, visited: job.visited.size, succeeded: job.succeeded, failed: job.failed, maxPages: job.maxPages },
    error: job.error || null,
  };
}
function trimJobs() {
  if (jobs.size <= MAX_STORED_JOBS) return;
  for (const [id, job] of jobs) {
    if (jobs.size <= MAX_STORED_JOBS) break;
    if (['completed','failed','cancelled'].includes(job.status)) jobs.delete(id);
  }
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function createCrawlJob({ urls, mode = 'static', maxPages = 25, maxDepth = 2, sameOrigin = true, domainDelayMs = DEFAULT_DOMAIN_DELAY_MS }) {
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > config.maxBatchSize) throw new Error(`Provide 1-${config.maxBatchSize} seed URLs`);
  if (!['static','dynamic'].includes(mode)) throw new Error('mode must be static or dynamic');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES_PER_JOB) throw new Error(`maxPages must be 1-${MAX_PAGES_PER_JOB}`);
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_DEPTH) throw new Error(`maxDepth must be 0-${MAX_DEPTH}`);
  if (!Number.isInteger(domainDelayMs) || domainDelayMs < 0 || domainDelayMs > MAX_DOMAIN_DELAY_MS) throw new Error(`domainDelayMs must be 0-${MAX_DOMAIN_DELAY_MS}`);

  const activeJobs = [...jobs.values()].filter(job => ['queued','running','paused'].includes(job.status)).length;
  if (activeJobs >= config.maxConcurrentJobs) throw new Error('Concurrent crawl job limit reached; wait for an active job to finish');
  const seeds = [];
  for (const raw of urls) {
    if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Each seed URL must be a string up to 2048 characters');
    seeds.push(await validateTarget(raw));
  }
  if (seeds.length > MAX_QUEUE_SIZE) throw new Error(`Provide no more than ${MAX_QUEUE_SIZE} seed URLs`);
  const id = randomUUID();
  const job = {
    id, status: 'queued', mode, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    startedAt: null, finishedAt: null, error: null, queue: seeds.map(url => ({url:url.href,depth:0})),
    queuedUrls: new Set(seeds.map(url => url.href)), abortController: new AbortController(),
    visited: new Set(), results: [], succeeded: 0, failed: 0, maxPages, maxDepth,
    sameOrigin, seedOrigins: new Set(seeds.map(url => url.origin)), domainDelayMs,
    lastDomainRequest: new Map(), pauseRequested: false, cancelRequested: false, running: false,
  };
  jobs.set(id, job); trimJobs();
  setImmediate(() => runJob(job));
  return publicJob(job);
}

async function runJob(job) {
  if (job.running) return;
  job.running = true;
  if (!job.startedAt) job.startedAt = new Date().toISOString();
  job.status = job.pauseRequested ? 'paused' : 'running';
  job.updatedAt = new Date().toISOString();
  try {
    while (job.queue.length && job.visited.size < job.maxPages && !job.cancelRequested) {
      while (job.pauseRequested && !job.cancelRequested) {
        job.status = 'paused'; job.updatedAt = new Date().toISOString(); await sleep(200);
      }
      if (job.cancelRequested) break;
      const item = job.queue.shift();
      job.queuedUrls.delete(item.url);
      let normalized;
      try {
        const safe = await validateTarget(item.url);
        normalized = safe.href;
        if (job.visited.has(normalized)) continue;
        job.visited.add(normalized);
        const origin = safe.origin;
        if (job.sameOrigin && !job.seedOrigins.has(origin)) {
          job.results.push({url:normalized,depth:item.depth,success:false,error:'Outside seed origins'});
          job.failed++; continue;
        }
        const previous = job.lastDomainRequest.get(safe.origin) || 0;
        const wait = job.domainDelayMs - (Date.now() - previous);
        if (wait > 0) await sleep(wait);
        job.lastDomainRequest.set(safe.origin, Date.now());
        const data = await scrape(normalized, job.mode, { signal: job.abortController.signal });
        if (data?.page?.usable === false) {
          job.results.push({
            url: normalized, depth: item.depth, success: false,
            status: data.page.status, reason: data.page.reason, retryable: data.page.status === 'empty_shell', data,
          });
          job.failed++;
          continue;
        }
        job.results.push({url:normalized,depth:item.depth,success:true,status:'success',data});
        job.succeeded++;
        if (item.depth < job.maxDepth) {
          for (const link of data.links || []) {
            if (!link.href) continue;
            try {
              const candidate = await validateTarget(new URL(link.href, normalized).href);
              if (job.sameOrigin && !job.seedOrigins.has(candidate.origin)) continue;
              if (!job.visited.has(candidate.href) && !job.queuedUrls.has(candidate.href) && job.queue.length < MAX_QUEUE_SIZE) {
                job.queue.push({url:candidate.href,depth:item.depth+1});
                job.queuedUrls.add(candidate.href);
              }
            } catch {}
          }
        }
      } catch (error) {
        if (!job.cancelRequested) {
          job.results.push({url:normalized || item.url,depth:item.depth,success:false,error:error.message || 'Crawl failed'});
          job.failed++;
        }
      }
      job.updatedAt = new Date().toISOString();
    }
    if (job.cancelRequested) job.status = 'cancelled';
    else if (job.pauseRequested) job.status = 'paused';
    else job.status = 'completed';
  } catch (error) {
    job.status = 'failed'; job.error = error.message || 'Job failed';
  } finally {
    job.running = false;
    job.updatedAt = new Date().toISOString();
    if (['completed','cancelled','failed'].includes(job.status)) job.finishedAt = new Date().toISOString();
    if (job.status === 'paused' && !job.cancelRequested) return;
    trimJobs();
  }
}

function getJob(id) { return jobs.get(id) || null; }
function listJobs() { return [...jobs.values()].map(publicJob).reverse(); }
function controlJob(id, action) {
  const job = getJob(id);
  if (!job) return null;
  if (action === 'cancel') {
    job.cancelRequested = true; job.pauseRequested = false;
    job.abortController.abort();
    if (!job.running && !['completed','failed','cancelled'].includes(job.status)) {
      job.status='cancelled'; job.finishedAt=new Date().toISOString();
    }
  } else if (action === 'pause') {
    if (['queued','running'].includes(job.status)) { job.pauseRequested=true; job.status='paused'; }
  } else if (action === 'resume') {
    if (job.status === 'paused') {
      job.pauseRequested=false; job.status='queued';
      if (!job.running) setImmediate(() => runJob(job));
    }
  } else return null;
  job.updatedAt = new Date().toISOString();
  return publicJob(job);
}
function getResults(id) {
  const job = getJob(id);
  return job ? {job:publicJob(job),results:job.results} : null;
}
module.exports = { createCrawlJob, getJob, listJobs, controlJob, getResults, publicJob };
