# HANZET-SCRAPER v3.0

A modular HTTP(S) scraping workbench built around **Node.js**, **Express**, **Cheerio**, and **Playwright**. V3 replaces the old mixed frontend/JVM design with a single API runtime and explicit security boundaries.

> Scrape only public resources you are permitted to access. Respect site terms, rate limits, copyright, and applicable law.

## Architecture

```text
index.html                 Responsive browser UI (no bundled frontend framework)
server.js                  Startup + graceful shutdown
src/
  app.js                   Express app, API routes, CORS, error handling
  config.js                Validated environment configuration
  middleware/rate-limit.js Bounded in-memory per-IP/path limiter
  security/url-policy.js   HTTP(S), hostname, DNS and public-IP policy
  services/scraper.js      Static fetch, Playwright mode, HTML extraction
test/
  url-policy.test.js       Security regression tests
```

### Security defaults

- Binds to `127.0.0.1` by default; change `HOST` only when you understand the exposure.
- Only HTTP and HTTPS targets on standard ports are accepted.
- Rejects localhost, local/internal hostnames, credentials in URLs, and DNS answers that include non-public IP addresses.
- Static requests validate each redirect and use a custom DNS lookup that rejects private/reserved destinations.
- Dynamic browser requests are intercepted and checked before being allowed; service workers, downloads, fonts and media are restricted.
- JSON request bodies, batch size, response size, redirects, timeouts, and concurrent batch jobs have explicit bounds.
- Rate limiting uses the socket peer address, not caller-supplied `X-Forwarded-For`.
- Admin API is disabled unless `ADMIN_TOKEN` is configured. When enabled, use the `X-Admin-Token` header.
- CORS only allows configured origins. CORS is not authentication; keep the API bound to localhost unless deployed behind a properly configured trusted gateway.
- Secrets belong in environment variables, never in source control.

**Important limitation:** in-memory rate limits reset on restart and are per process. For multi-instance deployments, use a shared store and a trusted proxy configuration. Browser automation is inherently more resource-intensive; deploy with operating-system/container limits and only scrape targets you are authorized to access. DNS and network controls should also be enforced at the host/container firewall for defense in depth.

## Requirements

- Node.js 20 or newer
- npm
- Chromium dependencies supported by Playwright

## Run locally

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm start
```

API listens at `http://127.0.0.1:3131` by default.

To open the UI, serve the repository root in a second terminal:

```bash
npx --yes serve . -l 3000
```

Then open `http://localhost:3000`. If you use a different frontend origin, add it to `CORS_ORIGINS` in `.env` and restart the API. Do not expose the service publicly without reviewing the security configuration.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3131` | API port |
| `NODE_ENV` | `development` | Runtime environment |
| `ADMIN_TOKEN` | unset | Enables protected admin endpoint when set |
| `CORS_ORIGINS` | localhost:3000 + 127.0.0.1:3000 | Comma-separated exact browser origins |
| `REQUEST_TIMEOUT_MS` | `15000` | Request/navigation timeout |
| `MAX_RESPONSE_BYTES` | `3000000` | Static response and rendered HTML limit |
| `MAX_BATCH_SIZE` | `5` | Maximum URLs per batch (hard cap 10) |
| `MAX_CONCURRENT_JOBS` | `3` | Concurrent jobs inside a batch |
| `MAX_REDIRECTS` | `3` | Maximum static redirects |

## API

### `GET /health`

Returns status, version, enabled modes, and whether admin routes are configured.

### `POST /scrape`

```json
{ "url": "https://example.com", "mode": "static" }
```

Set `mode` to `dynamic` to use Playwright. Response contains `success`, `jobId`, `elapsedMs`, `mode`, and extracted `data`.

### `POST /scrape/batch`

```json
{ "urls": ["https://example.com", "https://www.iana.org/domains/reserved"], "mode": "static" }
```

Batch requests are bounded by `MAX_BATCH_SIZE` and `MAX_CONCURRENT_JOBS`. Each result reports success or a per-URL error.

### `GET /admin/stats`

Requires `X-Admin-Token: <ADMIN_TOKEN>`. If `ADMIN_TOKEN` is unset, this endpoint remains disabled. The admin surface intentionally does not expose arbitrary IP block/unblock controls.

## Tests

```bash
npm test
```

Tests use Node's built-in test runner. GitHub Actions runs tests on Node.js 20 and 22.

## Migration notes

V2 used an inline frontend, Tor proxy support, a custom root-level rate limiter, and a separate Java/Bucket4j concept. V3 no longer wires the Java process or Tor proxy into the request path. The legacy `rateLimiter.js` and `Bucket4jRateLimiter.java` files are retained for historical reference only and are **not imported by V3**. The current runtime is the code under `src/`.

## License

See [LICENSE](LICENSE).
