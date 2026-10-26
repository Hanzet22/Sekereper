# Deprecated / Historical V2 Code

This directory contains archived rate-limiter implementations from the earlier V2 design. They are retained for reference only and are **not part of the HANZET-SCRAPER V3 runtime**.

## Files

- `rateLimiter.js` — legacy standalone Node.js token-bucket middleware.
- `Bucket4jRateLimiter.java` — legacy Java/Javalin/Bucket4j service prototype.

## Important

- V3 uses `src/middleware/rate-limit.js`; do not import or wire these archived files into V3.
- The Java file is not built by the current Node.js package scripts and its historical dependencies are not installed by `npm install`.
- Do not deploy the archived Java service as-is. Review authentication, proxy/IP trust, concurrency, limits, lifecycle, and operational security before any reuse.
- This folder is for historical reference, not a supported fallback or maintained implementation.
- Third-party notices for libraries referenced by this archived code are listed in the root `ATTRIBUTIONS.md`.
