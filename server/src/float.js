const { fetchJson, sleep } = require("./http");
const { chunk } = require("./alpaca");

const FOUND_CACHE_MS = 24 * 60 * 60 * 1000;
const MISSING_CACHE_MS = 6 * 60 * 60 * 1000;
const TICKERS_PER_REQUEST = 100;

// Share float from Massive (formerly Polygon.io).
// Looks up many tickers per request and caches results for a day, so the
// free plan's 5 requests per minute is rarely a bottleneck.
function createFloatProvider({
  apiKey,
  baseUrl = "https://api.massive.com",
  minIntervalMs = 12500,
  fetchImpl = fetch,
  sleepImpl = sleep,
}) {
  const cache = new Map();
  let nextRequestAt = 0;
  let queue = Promise.resolve();

  function isConfigured() {
    return Boolean(apiKey);
  }

  // Space requests out to respect the plan's rate limit.
  function throttled(task) {
    const run = queue.then(async () => {
      const wait = nextRequestAt - Date.now();

      if (wait > 0) {
        await sleepImpl(wait);
      }

      nextRequestAt = Date.now() + minIntervalMs;

      return task();
    });

    queue = run.catch(() => {});

    return run;
  }

  function toFloatData(result) {
    return {
      symbol: result.ticker,
      float: result.free_float,
      floatMillions: Number((result.free_float / 1_000_000).toFixed(2)),
      floatEffectiveDate: result.effective_date,
      freeFloatPercent: result.free_float_percent,
    };
  }

  async function fetchFloats(tickers) {
    const found = new Map();
    let url = new URL(`${baseUrl}/stocks/vX/float`);
    url.searchParams.set("ticker.any_of", tickers.join(","));
    url.searchParams.set("limit", "1000");

    while (url) {
      const data = await throttled(() =>
        fetchJson(
          url,
          { headers: { Authorization: `Bearer ${apiKey}` } },
          { fetchImpl },
        ),
      );

      for (const result of data.results || []) {
        if (Number.isFinite(result.free_float)) {
          found.set(result.ticker, toFloatData(result));
        }
      }

      url = data.next_url ? new URL(data.next_url) : null;
    }

    return found;
  }

  // Returns Map(symbol -> float data or null when Massive has no float).
  async function getFloats(symbols) {
    if (!isConfigured()) {
      throw new Error("MASSIVE_API_KEY is not set");
    }

    const now = Date.now();
    const results = new Map();
    const missing = [];

    for (const raw of symbols) {
      const symbol = raw.toUpperCase();
      const cached = cache.get(symbol);
      const maxAge = cached?.data ? FOUND_CACHE_MS : MISSING_CACHE_MS;

      if (cached && now - cached.timestamp < maxAge) {
        results.set(symbol, cached.data);
      } else {
        missing.push(symbol);
      }
    }

    for (const batch of chunk(missing, TICKERS_PER_REQUEST)) {
      const found = await fetchFloats(batch);

      for (const symbol of batch) {
        const data = found.get(symbol) || null;
        cache.set(symbol, { data, timestamp: Date.now() });
        results.set(symbol, data);
      }
    }

    return results;
  }

  async function getFloat(symbol) {
    const floats = await getFloats([symbol]);

    return floats.get(symbol.toUpperCase()) || null;
  }

  return { isConfigured, getFloats, getFloat };
}

module.exports = { createFloatProvider };
