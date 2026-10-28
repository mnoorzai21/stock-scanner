// Central configuration. Every value can be overridden with an environment
// variable so the scanner can be tuned without code changes.

function readNumber(name, fallback) {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    console.warn(`Ignoring invalid ${name}="${raw}". Using ${fallback}.`);
    return fallback;
  }

  return value;
}

function loadConfig() {
  return {
    port: readNumber("PORT", 3000),
    debug: process.env.DEBUG_SCANNER === "true",

    alpaca: {
      keyId: process.env.ALPACA_API_KEY,
      secretKey: process.env.ALPACA_SECRET_KEY,
      // "iex" is free. "sip" (all U.S. exchanges) needs a paid Alpaca data plan.
      feed: process.env.ALPACA_FEED || "iex",
      dataUrl: "https://data.alpaca.markets",
      tradingUrl:
        process.env.ALPACA_TRADING_URL || "https://paper-api.alpaca.markets",
    },

    massive: {
      apiKey: process.env.MASSIVE_API_KEY,
      baseUrl: "https://api.massive.com",
      // Massive's free plan allows 5 requests per minute.
      minIntervalMs: readNumber("MASSIVE_MIN_INTERVAL_MS", 12500),
    },

    criteria: {
      minPrice: readNumber("MIN_PRICE", 1),
      maxPrice: readNumber("MAX_PRICE", 20),
      minChangePercent: readNumber("MIN_CHANGE_PERCENT", 20),
      minRvol: readNumber("MIN_RVOL", 5),
      // Shares traded so far this session (on the data feed) needed for a
      // stock with no volume history to pass the RVOL filter.
      minNoHistoryVolume: readNumber("MIN_NO_HISTORY_VOLUME", 20_000),
      maxFloat: readNumber("MAX_FLOAT", 20_000_000),
      // Float data is flagged (not excluded) when the free-float percent is
      // below this, or when Massive's float data is older than this many days.
      minFreeFloatPercent: readNumber("MIN_FREE_FLOAT_PERCENT", 10),
      maxFloatAgeDays: readNumber("MAX_FLOAT_AGE_DAYS", 90),
      newsMaxAgeHours: readNumber("NEWS_MAX_AGE_HOURS", 24),
    },

    // How often the server re-scans while someone has the dashboard open.
    scanIntervalMs: readNumber("SCAN_INTERVAL_MS", 60_000),
    // Stop scanning after this long without a dashboard request.
    idleTimeoutMs: readNumber("SCAN_IDLE_TIMEOUT_MS", 10 * 60_000),
  };
}

module.exports = { loadConfig, readNumber };
