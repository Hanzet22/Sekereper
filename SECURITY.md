# Security Controls and Hardening Status

This document describes the controls that exist in HANZET-SCRAPER and distinguishes implemented controls from items that do not apply to the current architecture. A checklist item is not marked complete merely because a future architecture could support it.

## Control register

| # | Control | Current status | Notes |
|---:|---|---|---|
| 1 | Hide API keys | **Implemented by configuration practice** | Private provider credentials are read from environment variables. Keep them in Vercel Environment Variables or a local ignored `.env`; never place them in browser code or commit them. `.env.example` contains placeholders only. |
| 2 | Purge Git secrets | **Needs owner review** | `.gitignore` excludes local env files and key material. This does not erase secrets from Git history. Run a full-history secret scan; if a real credential was ever committed, revoke/rotate it first, then coordinate history cleanup. |
| 3 | Use public DB key | **Not applicable** | The current application has no database integration or database API key. If a client-side database is added, only its documented public/anonymous key may be exposed, never a service-role key. |
| 4 | Enable RLS | **Not applicable** | No Postgres/Supabase database or row store is present. Enable and test row-level policies before adding one. |
| 5 | Encrypt sensitive data | **Not applicable to current storage model** | Scraped results and crawl jobs are held in process memory and the browser session; there is no application database at rest. Use managed encryption and key rotation if persistent sensitive data is introduced. |
| 6 | Enforce server-side auth | **Partially implemented / architecture decision** | `/admin/stats` is disabled without `ADMIN_TOKEN` and uses constant-time comparison. Public scrape and crawl routes are intentionally public utility endpoints; they are not user-account routes. Do not treat CORS as authentication. |
| 7 | Lock record access | **Partially implemented** | Crawl IDs are random UUIDs and public job responses are projected through `publicJob()`. There is no per-user ownership model; anyone who obtains a job ID can read/control that job. Add authenticated ownership before supporting private or multi-user jobs. |
| 8 | Block field tampering | **Partially implemented** | Route handlers validate key inputs and ignore fields they do not consume. Add strict schemas/unknown-field rejection before accepting new privileged or persisted records. |
| 9 | Secure session cookies | **No user session system** | The optional challenge cookie is signed, HttpOnly, Secure, SameSite=Lax, IP-bound, and short-lived. It is not an account login session. |
| 10 | Hash passwords | **Not applicable** | The application has no user registration, login, or stored passwords. If accounts are introduced, use a modern password hashing scheme such as Argon2id through a maintained library; never reversible encryption or plain SHA hashes. |
| 11 | Rate limit login | **Not applicable as no login exists** | General API rate limiting is implemented in memory at 30 requests per minute per remote address and path. It is not a distributed limiter and may need a shared store for multi-instance deployments. |
| 12 | Add bot protection | **Optional control implemented** | IPQualityScore risk checks plus Cloudflare Turnstile can be enabled with all required environment variables. If unconfigured, the challenge is disabled; provider outages fail open. |
| 13 | Parameterize queries | **Not applicable** | No SQL/database queries are used in the current runtime. Use parameterized statements or a safe query builder if a database is added. |
| 14 | Validate all input | **Partially implemented** | JSON size/type, URL scheme/credentials/ports/DNS, batch sizes, crawl limits, modes, and parser input types are validated. Continue schema validation for every new endpoint and bound every nested collection/string. |
| 15 | Escape user content | **Partially implemented** | Error-page dynamic text is HTML-escaped; the browser console uses `textContent` and DOM node creation rather than injecting scraped strings as HTML. Keep this rule for future UI features. |
| 16 | Restrict file uploads | **Not applicable** | No file-upload endpoint exists. If uploads are introduced, enforce allowlisted types, size limits, content inspection, generated filenames, and storage outside executable/public paths. |
| 17 | Trim API responses | **Partially implemented** | Crawl listings use a deliberate public projection and health reports capabilities only. Some scrape failure messages are still returned to callers; review error normalization before adding more sensitive internals. |
| 18 | Add security headers | **Implemented baseline** | Responses include CSP, nosniff, frame denial, referrer and permissions policies, cross-origin isolation headers, no-store caching, and production HSTS. CSP retains `unsafe-inline` for the existing inline challenge page; replace it with nonces/hashes before claiming a strict CSP. |
| 19 | Force HTTPS | **Platform-dependent** | Production HSTS is emitted by the app. Vercel terminates TLS at the edge; confirm the production domain redirects HTTP to HTTPS in project/domain settings. HSTS only takes effect after a browser receives it over HTTPS. |
| 20 | Scan dependencies | **Implemented in CI** | CI runs `npm audit --audit-level=high`; Dependabot checks npm and GitHub Actions dependencies weekly. Audit results depend on the current lockfile and advisory database. |

## Operational requirements

- Store private credentials only in the hosting provider's encrypted environment-variable store. Use separate values for Production, Preview, and Development where appropriate.
- Rotate any credential suspected of exposure immediately. Removing a value from the latest commit does not revoke it or remove it from Git history.
- Review GitHub repository secret-scanning and push-protection settings. A source-code scan is not proof that no secret was ever exposed.
- Keep the Vercel production domain on HTTPS and verify its HTTP-to-HTTPS redirect after deployment.
- Do not add a database, accounts, uploads, or private user records without first designing ownership, authorization, retention, backup, and deletion behavior.
- The public scraper is intentionally callable without an account. If that changes, define an authentication and authorization model before adding UI-only gates.

This register is an implementation-status guide, not a penetration-test report or security certification.
