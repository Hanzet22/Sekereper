# HANZET-SCRAPER v3.5.0 — Crawl Orchestrator

A modular HTTP(S) scraping workbench built with Node.js, Express, Cheerio, and Playwright. V3.5 adds bounded crawl jobs, pause/resume/cancel controls, structured exports, feed and discovery parsers, result comparison, and an adapter extension contract.

> Use only for public resources you are permitted to access. Respect site terms, rate limits, copyright, privacy, and applicable law.

## What's new in v3.5

- Crawl jobs: seed URLs, bounded page count and depth, same-origin default, per-domain delay, progress, pause/resume/cancel, and job result retrieval.
- Structured exports: JSON, CSV, and NDJSON.
- Discovery parser: parse supplied sitemap XML.
- Feed parser: parse supplied RSS/Atom XML into structured items.
- Data comparison: report additions, removals, and changed results.
- Adapter foundation: explicit host-code registration contract for future parsers.
- Existing URL safety policy, bounded request bodies, rate limiting, and admin token gating remain central.

## Architecture

- index.html — browser UI
- server.js — startup and graceful shutdown
- src/app.js — HTTP API routes and validation
- src/config.js — validated environment configuration
- src/middleware/rate-limit.js — bounded in-memory rate limiter
- src/security/url-policy.js — HTTP(S), DNS and public-IP policy
- src/services/scraper.js — static fetch, Playwright and extraction
- src/services/job-manager.js — in-memory crawl lifecycle/orchestration
- src/services/exporters.js — CSV/NDJSON and comparison helpers
- src/services/feed-parser.js — RSS/Atom parsing
- src/services/discovery-parser.js — sitemap parsing
- src/plugins/index.js — explicit adapter registration contract
- test/ — Node built-in test suite
- deprecated/ — archived V2 rate-limiter prototypes; not loaded by V3

## Security model and limitations

- Binds to 127.0.0.1 by default; change HOST only after reviewing exposure.
- Only HTTP(S) targets on standard ports are accepted. Local/internal hostnames, URL credentials, and DNS answers containing non-public addresses are rejected.
- Static requests revalidate redirects and use a custom DNS lookup to reject private/reserved destinations.
- Dynamic browser requests are restricted to the same origin; cross-origin subresources, service workers, downloads, fonts, and media are blocked. This improves isolation but can break sites relying on third-party scripts or CDNs.
- Crawl jobs have a maximum of 100 pages, depth 5, bounded seed list, and bounded per-domain delay. Queue and job history are in-memory.
- The sitemap endpoint parses XML supplied by the caller; it does not automatically fetch sitemap URLs.
- Adapter registration is a host-code extension interface, not a remote plugin installer. Do not load untrusted code as plugins.
- Rate limits, crawl history, and results are in-memory and disappear on restart. Use a durable queue/database before production multi-instance deployment.
- Dynamic browser byte accounting is best-effort; OS/container limits and firewall rules are recommended for defense in depth.
- Admin API is disabled unless ADMIN_TOKEN is configured. When enabled, send X-Admin-Token. CORS is not authentication.
- Never commit secrets. Keep the API on localhost unless you have reviewed deployment boundaries.

## Deprecated historical code

The old V2 rate-limiter prototypes are kept in [deprecated/](./deprecated/) for reference only. V3 uses `src/middleware/rate-limit.js`; archived files are not loaded by the current runtime and should not be treated as supported alternatives.

## License and attributions

HANZET-SCRAPER is licensed under **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**. See [LICENSE](./LICENSE) for the complete license text.

The AGPL applies to this project's own copyrightable code. Third-party dependencies and other included materials remain under their respective licenses; see [ATTRIBUTIONS.md](./ATTRIBUTIONS.md). Changing this project's license does not relicense third-party software.

If you modify this program and make it available for users to interact with over a network, review AGPL-3.0 section 13 for the corresponding source-code offer requirements. This project does not provide legal advice.

## Requirements and setup

Requirements: Node.js 20+, npm, and a compatible Chromium browser for dynamic mode. On glibc-compatible Linux, install it with `npx playwright install chromium`. On Alpine/musl (including Alpine in PRoot), install the native browser with `apk add chromium` and set `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium`.

    npm install
    npx playwright install chromium   # glibc-compatible Linux
    cp .env.example .env

For Alpine/musl, install native Chromium (`apk add chromium`) and uncomment `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium` in `.env`.
    npm start

API default: http://127.0.0.1:3131.

Serve the browser UI in another terminal:

    npx --yes serve . -l 3000

Open http://localhost:3000. Configure CORS_ORIGINS if using a different browser origin.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| HOST | 127.0.0.1 | Bind address |
| PORT | 3131 | API port |
| NODE_ENV | development | Runtime environment |
| ADMIN_TOKEN | unset | Enables protected admin endpoint |
| CORS_ORIGINS | http://127.0.0.1:3000,http://localhost:3000 | Exact allowed browser origins |
| REQUEST_TIMEOUT_MS | 15000 | Request/navigation timeout |
| MAX_RESPONSE_BYTES | 3000000 | Static response/rendered HTML limit |
| MAX_BATCH_SIZE | 5 | Batch seed URLs (hard cap 10) |
| MAX_CONCURRENT_JOBS | 3 | Concurrent workers in a batch |
| MAX_REDIRECTS | 3 | Maximum static redirects |
| PLAYWRIGHT_EXECUTABLE_PATH | unset | Optional Chromium executable path, e.g. `/usr/bin/chromium` on Alpine |

## API reference

### Health and single/batch scraping

- GET /health — version, capabilities, and admin configuration status.
- POST /scrape — JSON body: {"url":"https://example.com","mode":"static"}. Mode can be static or dynamic.
- POST /scrape/batch — JSON body: {"urls":["https://example.com"],"mode":"static"}. Bounded by configured batch size and concurrency.

### Crawl jobs

Create a job with JSON:

    {
      "urls": ["https://example.com"],
      "mode": "static",
      "maxPages": 25,
      "maxDepth": 2,
      "sameOrigin": true,
      "domainDelayMs": 500
    }

- POST /crawl/jobs — create a background crawl (HTTP 202).
- GET /crawl/jobs — list recent jobs.
- GET /crawl/jobs/:id — progress and status.
- POST /crawl/jobs/:id/pause, /resume, or /cancel — lifecycle controls.
- GET /crawl/jobs/:id/results — JSON results.
- GET /crawl/jobs/:id/results?format=csv — flattened CSV.
- GET /crawl/jobs/:id/results?format=ndjson — one JSON result per line.

Crawling is constrained by page/depth limits and domain delay. Same-origin mode is on by default. Set sameOrigin:false only when you have a clear reason and authorization to follow links across public origins.

### Data and discovery tools

- POST /compare — compare previous/current arrays, each capped at 1,000 entries.
- GET /adapters — list adapters registered by application code.
- POST /parse/feed — parse supplied RSS/Atom XML in the xml field.
- POST /parse/sitemap — parse supplied sitemap XML in the xml field.

These endpoints parse caller-supplied content; they do not fetch arbitrary remote files.

### Admin

GET /admin/stats requires X-Admin-Token: <ADMIN_TOKEN>. If the token is unset, it returns HTTP 503. The admin API does not expose arbitrary IP block/unblock controls.

## Tests and CI

    npm test

The test suite uses Node's built-in test runner. GitHub Actions runs it on Node.js 20 and 22. A green CI run is necessary but does not replace a local smoke test with Chromium installed.

## Migration notes

V2 used an inline frontend, Tor proxy support, a root-level rate limiter, and a separate Java/Bucket4j concept. V3 no longer wires the Java process or Tor proxy into the request path. rateLimiter.js and Bucket4jRateLimiter.java remain historical references and are not imported by the V3 runtime.

## License

See LICENSE.


## Frontend architecture

The HTML5 entry point is `index.html`; custom CSS, Tailwind CSS v4 source/output, SVG icons, Canvas animation, and the Houdini Paint Worklet live under `ui/`. Express serves `/` and `/ui/*` from the same origin as the API. Run `npm install` and `npm start`; rebuild or watch Tailwind with `npm run build:ui:css` and `npm run watch:ui:css`. See [ui/README.md](ui/README.md).
