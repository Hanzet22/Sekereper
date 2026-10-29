'use strict';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

const ERROR_PAGE_VIDEOS = Object.freeze({
  '403': 'https://files.catbox.moe/v2xl73.mp4',
  '404': 'https://files.catbox.moe/yfd0hd.mp4',
  '418': 'https://files.catbox.moe/06uaw4.mp4',
  '429': 'https://files.catbox.moe/9yah42.mp4',
});

function renderErrorPage({ status, code, title, message, detail }) {
  const safeTitle = escapeHtml(title || 'Request Error');
  const safeCode = escapeHtml(code || status);
  const safeMessage = escapeHtml(message || 'The request could not be completed.');
  const safeDetail = detail ? escapeHtml(detail) : '';
  const videoUrl = ERROR_PAGE_VIDEOS[String(status)];
  const videoMarkup = videoUrl
    ? '<section class="error-media" aria-label="Error video"><video controls autoplay muted loop playsinline preload="metadata"><source src="' + videoUrl + '" type="video/mp4">Your browser does not support embedded video.</video><p class="media-note">Error-page video. Playback may be unavailable if the external host is down.</p></section>'
    : '';
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
h1{font-size:clamp(1.5rem,4vw,2.2rem);margin:0 0 14px}p{line-height:1.7;color:#cbd5e1;margin:10px 0}.detail{margin-top:24px;padding:14px 16px;border-left:3px solid #60a5fa;background:#0b1220;border-radius:0 10px 10px 0;font-size:.92rem}.error-media{margin-top:24px}.error-media video{display:block;width:100%;max-height:420px;aspect-ratio:16/9;object-fit:contain;background:#020617;border:1px solid #334155;border-radius:14px}.media-note{font-size:.78rem;color:#94a3b8}
a{display:inline-flex;margin-top:26px;padding:12px 18px;border-radius:12px;background:#dbeafe;color:#0f172a;text-decoration:none;font-weight:800}a:focus-visible{outline:3px solid #fbbf24;outline-offset:3px}.foot{margin-top:28px;font-size:.75rem;color:#64748b;letter-spacing:.08em}
</style>
</head>
<body><main role="main">
<div class="brand">HANZET / SECURITY RESPONSE</div>
<div class="code">${safeCode}</div>
<h1>${safeTitle}</h1>
<p>${safeMessage}</p>
${safeDetail ? `<div class="detail">${safeDetail}</div>` : ''}
${videoMarkup}
<a href="/">Return to workbench</a>
<div class="foot">HANZET-SCRAPER · CUSTOM ERROR SYSTEM · v3.7.0</div>
</main></body></html>`;
}


function renderChallengePage(siteKey) {
  const safeKey = escapeHtml(siteKey || '');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>1998 · Security Challenge — HANZET-SCRAPER</title><style>:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#080c16;color:#eef2ff}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 15% 5%,#172554,transparent 42%),#080c16}main{width:min(100%,620px);padding:clamp(24px,6vw,48px);border:1px solid #334155;border-radius:24px;background:#0f172a}small{letter-spacing:.18em;color:#93c5fd;font-weight:800}.code{font-size:clamp(4rem,16vw,7rem);font-weight:900;line-height:1;margin:24px 0}p{line-height:1.7;color:#cbd5e1}.widget{margin:24px 0}.error{color:#fca5a5;min-height:1.5em}button{border:0;border-radius:12px;background:#dbeafe;color:#0f172a;padding:12px 18px;font-weight:800;cursor:pointer}a{color:#93c5fd}</style></head><body><main><small>HANZET / SECURITY CHALLENGE</small><div class="code">1998</div><h1>Verify this request</h1><p>Your connection has a risk signal associated with VPN/proxy infrastructure. Complete verification to continue. VPN use alone is not proof of abuse.</p><form id="challenge-form"><div class="widget"><div class="cf-turnstile" data-sitekey="' + safeKey + '" data-theme="dark"></div></div><p id="challenge-error" class="error" role="status"></p><button type="submit">Verify &amp; continue</button></form><p><a href="/">Return to workbench</a></p></main><script>var consent=null;try{consent=JSON.parse(localStorage.getItem("hanzet-scraper-cookie-consent-v1")||"null");}catch(_){}var allowed=!!(consent&&consent.version===1&&consent.categories&&consent.categories.essential===true);var form=document.getElementById("challenge-form");var out=document.getElementById("challenge-error");if(allowed){var script=document.createElement("script");script.src="https://challenges.cloudflare.com/turnstile/v0/api.js";script.async=true;script.defer=true;document.head.appendChild(script);}else{out.textContent="Security verification is optional. To load the external verification widget, enable Essential / Security in Cookie Preferences on the workbench, then retry.";form.querySelector("button").disabled=true;}form.addEventListener("submit",async function(e){e.preventDefault();var current=null;try{current=JSON.parse(localStorage.getItem("hanzet-scraper-cookie-consent-v1")||"null");}catch(_){}if(!(current&&current.version===1&&current.categories&&current.categories.essential===true)){out.textContent="Essential / Security consent is off. Return to the workbench and update Cookie Preferences.";return;}var field=document.querySelector("[name=cf-turnstile-response]");var token=field&&field.value;if(!token){out.textContent="Complete the challenge first.";return;}out.textContent="Verifying…";try{var response=await fetch("/challenge/verify",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json","X-Hanzet-Essential-Consent":"true"},body:JSON.stringify({token:token})});var data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||"Verification failed");location.assign("/");}catch(error){out.textContent=error.message||"Verification failed. Try again.";if(window.turnstile)window.turnstile.reset();}});</script></body></html>';
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

module.exports = { escapeHtml, renderErrorPage, renderChallengePage, sendError };
