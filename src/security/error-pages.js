'use strict';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function renderErrorPage({ status, code, title, message, detail }) {
  const safeTitle = escapeHtml(title || 'Request Error');
  const safeCode = escapeHtml(code || status);
  const safeMessage = escapeHtml(message || 'The request could not be completed.');
  const safeDetail = detail ? escapeHtml(detail) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#080c16">
<title>${safeCode} · ${safeTitle} — HANZET-SCRAPER</title>
<style>
:root{color-scheme:dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080c16;color:#eef2ff}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 15% 5%,#172554 0,transparent 42%),radial-gradient(ellipse at 90% 95%,#3f1d2e 0,transparent 38%),#080c16}
main{width:min(100%,720px);border:1px solid #334155;border-radius:24px;padding:clamp(24px,6vw,52px);background:rgba(15,23,42,.88);box-shadow:0 24px 90px #0008}
.brand{font-size:.78rem;letter-spacing:.22em;color:#93c5fd;font-weight:800}.code{font-size:clamp(4rem,15vw,8rem);line-height:1;margin:24px 0 12px;font-weight:900;letter-spacing:-.08em;color:#f8fafc;text-shadow:0 0 36px #60a5fa33;overflow-wrap:anywhere}
h1{font-size:clamp(1.5rem,4vw,2.2rem);margin:0 0 14px}p{line-height:1.7;color:#cbd5e1;margin:10px 0}.detail{margin-top:24px;padding:14px 16px;border-left:3px solid #60a5fa;background:#0b1220;border-radius:0 10px 10px 0;font-size:.92rem}
a{display:inline-flex;margin-top:26px;padding:12px 18px;border-radius:12px;background:#dbeafe;color:#0f172a;text-decoration:none;font-weight:800}a:focus-visible{outline:3px solid #fbbf24;outline-offset:3px}.foot{margin-top:28px;font-size:.75rem;color:#64748b;letter-spacing:.08em}
</style>
</head>
<body><main role="main">
<div class="brand">HANZET / SECURITY RESPONSE</div>
<div class="code">${safeCode}</div>
<h1>${safeTitle}</h1>
<p>${safeMessage}</p>
${safeDetail ? `<div class="detail">${safeDetail}</div>` : ''}
<a href="/">Return to workbench</a>
<div class="foot">HANZET-SCRAPER · CUSTOM ERROR SYSTEM · v3.6.0</div>
</main></body></html>`;
}

function sendError(req, res, options) {
  const { status = 500, code = String(status), title = 'Request Error', message = 'The request could not be completed.', detail } = options || {};
  res.setHeader('X-Error-Code', String(code));
  res.setHeader('Cache-Control', 'no-store');
  const accept = String(req?.headers?.accept || '');
  if (accept.includes('text/html')) {
    return res.status(status).type('html').send(renderErrorPage({ status, code, title, message, detail }));
  }
  return res.status(status).json({
    success: false,
    status,
    code: String(code),
    error: message,
    title,
    ...(detail ? { detail } : {}),
  });
}

module.exports = { escapeHtml, renderErrorPage, sendError };
