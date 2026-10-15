require("dotenv").config({ quiet: true });

const { loadConfig } = require("./src/config");
const { createAlpacaClient } = require("./src/alpaca");
const { createFloatProvider } = require("./src/float");
const { createScanner, createScanService } = require("./src/scanner");
const { createApp } = require("./src/app");

const config = loadConfig();

const alpaca = createAlpacaClient(config.alpaca);
const floats = createFloatProvider(config.massive);

const scanner = createScanner({
  alpaca,
  floats,
  criteria: config.criteria,
  log: config.debug ? console.log : () => {},
});

const service = createScanService({
  scanner,
  intervalMs: config.scanIntervalMs,
  idleTimeoutMs: config.idleTimeoutMs,
});

const app = createApp({ service, alpaca, floats, config });

if (!alpaca.isConfigured()) {
  console.warn("Warning: ALPACA_API_KEY and ALPACA_SECRET_KEY are not set.");
}

if (!floats.isConfigured()) {
  console.warn("Warning: MASSIVE_API_KEY is not set. The float filter will not work.");
}

service.start();

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`Market data feed: ${config.alpaca.feed}`);
});
