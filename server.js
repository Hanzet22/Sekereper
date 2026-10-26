'use strict';

/**
 * HANZET-SCRAPER v3.0
 * Secure-by-default entry point. The implementation lives in src/.
 * Only explicitly public HTTP(S) targets are accepted by the scraper.
 */
require('dotenv').config();
const { createApp } = require('./src/app');
const { config } = require('./src/config');

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`[HANZET-SCRAPER] v3.0 listening on http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`[HANZET-SCRAPER] ${signal}: shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
