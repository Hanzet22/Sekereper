(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let lastOutput = '';
  let lastOutputType = 'application/json';
  let lastOutputName = 'hanzet-scraper-result.json';
  let pollTimer = null;
  let pollingJobId = null;
  const activeStatuses = new Set(['queued', 'running', 'paused']);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function urls() { return $('urls').value.split(/\r?\n/).map(v => v.trim()).filter(Boolean); }
  function apiUrl(path) {
    const configured = $('api').value.trim();
    const localOrigin = ['http:', 'https:'].includes(window.location.protocol) ? window.location.origin : 'http://127.0.0.1:3131';
    const base = new URL(configured || localOrigin);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('API URL must use HTTP or HTTPS.');
    return base.href.replace(/\/+$/, '') + path;
  }
  function setApiState(state) {
    const pill = $('apiState');
    pill.dataset.state = state;
    $('apiStateText').textContent = 'API ' + state.toUpperCase();
  }
  function show(data, status, tag = 'Complete', kind = '', outputType, outputName) {
    const discoveredJobId = data?.job?.id || data?.jobId;
    if (discoveredJobId) $('jobId').value = discoveredJobId;
    if (typeof data === 'string') {
      lastOutput = data;
      lastOutputType = outputType || 'text/plain;charset=utf-8';
      lastOutputName = outputName || 'hanzet-scraper-export.txt';
    } else {
      lastOutput = JSON.stringify(data, null, 2);
      lastOutputType = outputType || 'application/json';
      lastOutputName = outputName || 'hanzet-scraper-result.json';
    }
    $('output').textContent = lastOutput;
    $('status').textContent = status;
    $('status').dataset.kind = kind;
    $('result-tag').textContent = tag.toUpperCase();
  }
  async function request(path, body) {
    const options = body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {};
    const response = await fetch(apiUrl(path), options);
    const data = await response.json().catch(() => ({error:'API returned a non-JSON response'}));
    if (!response.ok) throw new Error(data.error || 'Request failed with HTTP ' + response.status);
    return data;
  }
  function downloadText(text, type, filename) {
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function updateJobProgress(job) {
    if (!job || !job.id) return;
    const p = job.progress || {};
    const visited = Number(p.visited) || 0;
    const maxPages = Number(p.maxPages) || 1;
    const finished = ['completed','cancelled','failed'].includes(job.status);
    const pct = finished ? 100 : Math.min(100, Math.round(visited / maxPages * 100));
    $('progressStatus').textContent = String(job.status || 'unknown').toUpperCase() + ' · ' + job.id.slice(0, 8);
    $('progressCounts').textContent = visited + ' / ' + maxPages + ' visited';
    $('progressBar').value = pct;
    $('progressBar').setAttribute('aria-label', 'Crawl progress ' + pct + ' percent');
    const updated = job.updatedAt ? new Date(job.updatedAt).toLocaleTimeString() : 'just now';
    $('progressMeta').textContent = (Number(p.queued) || 0) + ' queued · ' + (Number(p.succeeded) || 0) + ' succeeded · ' + (Number(p.failed) || 0) + ' failed · updated ' + updated + (job.error ? ' · ' + job.error : '');
  }
  function renderJobs(jobs) {
    const holder = $('jobHistory');
    holder.replaceChildren();
    if (!Array.isArray(jobs) || jobs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'job-history-empty';
      empty.textContent = 'No crawl jobs found.';
      holder.appendChild(empty);
      return;
    }
    for (const job of jobs.slice(0, 12)) {
      const progress = job.progress || {};
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'secondary job-chip';
      chip.setAttribute('role', 'listitem');
      chip.textContent = (job.id || 'unknown').slice(0, 8) + ' · ' + (job.status || 'unknown') + ' · ' + (Number(progress.visited) || 0) + '/' + (Number(progress.maxPages) || 0);
      chip.title = job.id || '';
      chip.addEventListener('click', () => {
        $('jobId').value = job.id || '';
        updateJobProgress(job);
        if (job.id) refreshJob(job.id);
      });
      holder.appendChild(chip);
    }
  }
  function stopPolling() {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
    pollingJobId = null;
  }
  function schedulePolling(id, delay = 1600) {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollingJobId = id;
    pollTimer = window.setTimeout(async () => {
      if (pollingJobId !== id) return;
      try {
        const data = await request('/crawl/jobs/' + encodeURIComponent(id));
        setApiState('online');
        if (data.job) {
          updateJobProgress(data.job);
          if (activeStatuses.has(data.job.status)) schedulePolling(id);
          else stopPolling();
        } else stopPolling();
      } catch (error) {
        setApiState('offline');
        $('progressMeta').textContent = 'Could not refresh this job: ' + error.message;
        if (pollingJobId === id) schedulePolling(id, 3500);
      }
    }, delay);
  }
  async function refreshJob(id) {
    if (!id) return;
    try {
      const data = await request('/crawl/jobs/' + encodeURIComponent(id));
      if (data.job) {
        updateJobProgress(data.job);
        if (activeStatuses.has(data.job.status)) schedulePolling(id);
        else if (pollingJobId === id) stopPolling();
      }
    } catch (error) {
      $('progressMeta').textContent = 'Could not load job: ' + error.message;
    }
  }
  function syncJobData(data) {
    if (Array.isArray(data?.jobs)) {
      renderJobs(data.jobs);
      const selected = $('jobId').value.trim();
      const current = data.jobs.find(job => job.id === selected);
      if (current) updateJobProgress(current);
    }
    if (data?.job?.id) {
      const job = data.job;
      $('jobId').value = job.id;
      updateJobProgress(job);
      if (activeStatuses.has(job.status)) schedulePolling(job.id);
      else if (pollingJobId === job.id) stopPolling();
    }
  }
  async function run(buttonId, path, bodyFactory, label) {
    const button = $(buttonId);
    button.disabled = true;
    $('status').textContent = label + '…';
    $('status').dataset.kind = '';
    if (path === '/health') setApiState('checking');
    try {
      const data = await request(path, bodyFactory ? bodyFactory() : undefined);
      if (path === '/health') setApiState(data.status === 'ok' ? 'online' : 'offline');
      else setApiState('online');
      show(data, label + ' completed.', 'Complete', 'success');
      syncJobData(data);
    } catch (error) {
      if (path === '/health') setApiState('offline');
      show({success:false,error:error.message}, 'Request failed: ' + error.message, 'Error', 'error');
    } finally {
      button.disabled = false;
    }
  }

  $('single').addEventListener('click', () => {
    const list = urls();
    if (!list.length) return show({error:'Enter a URL first.'}, 'Enter a URL first.', 'Input needed', 'error');
    run('single','/scrape',() => ({url:list[0],mode:$('mode').value}),'Scraping');
  });
  $('batch').addEventListener('click', () => {
    const list = urls();
    if (!list.length) return show({error:'Enter at least one URL.'}, 'Enter at least one URL.', 'Input needed', 'error');
    run('batch','/scrape/batch',() => ({urls:list,mode:$('mode').value}),'Running batch');
  });
  $('health').addEventListener('click', () => run('health','/health',null,'Checking API'));
  $('api').addEventListener('change', () => setApiState('unknown'));
  $('crawl').addEventListener('click', () => {
    const list = urls();
    if (!list.length) return show({error:'Enter at least one seed URL.'}, 'Enter at least one seed URL.', 'Input needed', 'error');
    const payload = {
      urls:list, mode:$('mode').value, maxPages:Number($('maxPages').value),
      maxDepth:Number($('maxDepth').value), domainDelayMs:Number($('delay').value),
      sameOrigin:$('sameOrigin').checked
    };
    if (!Number.isInteger(payload.maxPages) || payload.maxPages < 1 || payload.maxPages > 100 ||
        !Number.isInteger(payload.maxDepth) || payload.maxDepth < 0 || payload.maxDepth > 5 ||
        !Number.isInteger(payload.domainDelayMs) || payload.domainDelayMs < 0 || payload.domainDelayMs > 5000) {
      return show({error:'Check crawl limits: pages 1–100, depth 0–5, delay 0–5000 ms.'}, 'Check the crawl limits and try again.', 'Input needed', 'error');
    }
    run('crawl','/crawl/jobs',() => payload,'Creating crawl job');
  });
  $('jobs').addEventListener('click', () => run('jobs','/crawl/jobs',null,'Loading crawl jobs'));
  function jobAction(action) {
    const id = $('jobId').value.trim();
    if (!id) return show({error:'Enter or select a crawl job ID.'}, 'Enter or select a crawl job ID.', 'Input needed', 'error');
    run(action + 'Job','/crawl/jobs/' + encodeURIComponent(id) + '/' + action,() => ({}),action + ' job');
  }
  $('pauseJob').addEventListener('click', () => jobAction('pause'));
  $('resumeJob').addEventListener('click', () => jobAction('resume'));
  $('cancelJob').addEventListener('click', () => jobAction('cancel'));

  async function showJobResults(format) {
    const id = $('jobId').value.trim();
    if (!id) return show({error:'Enter or select a crawl job ID.'}, 'Enter or select a crawl job ID.', 'Input needed', 'error');
    try {
      $('status').textContent = 'Loading crawl results…';
      const query = format ? '?format=' + encodeURIComponent(format) : '';
      const response = await fetch(apiUrl('/crawl/jobs/' + encodeURIComponent(id) + '/results' + query));
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'HTTP ' + response.status);
      }
      setApiState('online');
      if (format === 'csv' || format === 'ndjson') {
        const text = await response.text();
        const type = response.headers.get('content-type') || (format === 'csv' ? 'text/csv;charset=utf-8' : 'application/x-ndjson;charset=utf-8');
        const filename = 'hanzet-scraper-' + id.slice(0, 8) + '.' + format;
        show(text, format.toUpperCase() + ' export downloaded.', format, 'success', type, filename);
        downloadText(text, type, filename);
      } else {
        const data = await response.json();
        show(data, 'Crawl results loaded.', 'Results', 'success');
        syncJobData(data);
      }
    } catch(error) {
      show({error:error.message}, 'Could not load results: ' + error.message, 'Error', 'error');
    }
  }
  $('jobResults').addEventListener('click', () => showJobResults('json'));
  $('exportCSV').addEventListener('click', () => showJobResults('csv'));
  $('exportNDJSON').addEventListener('click', () => showJobResults('ndjson'));
  $('copy').addEventListener('click', async () => {
    if (!lastOutput) return;
    try {
      await navigator.clipboard.writeText(lastOutput);
      $('status').textContent = 'Output copied to clipboard.';
      $('status').dataset.kind = 'success';
    } catch {
      $('status').textContent = 'Clipboard unavailable in this browser context.';
      $('status').dataset.kind = 'error';
    }
  });
  $('download').addEventListener('click', () => {
    if (!lastOutput) return;
    downloadText(lastOutput, lastOutputType, lastOutputName);
  });
  $('clear').addEventListener('click', () => {
    lastOutput = '';
    lastOutputType = 'application/json';
    lastOutputName = 'hanzet-scraper-result.json';
    $('output').textContent = 'Console cleared. Run a request to display results.';
    $('status').textContent = '';
    $('status').dataset.kind = '';
    $('result-tag').textContent = 'READY';
  });

  // Refresh the real API state on open; this does not block UI controls.
  request('/health').then(data => setApiState(data.status === 'ok' ? 'online' : 'offline')).catch(() => setApiState('offline'));
})();
