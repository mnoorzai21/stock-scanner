const { fetchJson } = require("./http");

const SNAPSHOT_BATCH_SIZE = 200;
const SNAPSHOT_CONCURRENCY = 4;
const BARS_BATCH_SIZE = 50;
const ASSET_CACHE_MS = 6 * 60 * 60 * 1000;
const CALENDAR_CACHE_MS = 60 * 60 * 1000;

function chunk(items, size) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

// Run async work over items with a fixed number of parallel workers.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, run),
  );

  return results;
}

function createAlpacaClient({
  keyId,
  secretKey,
  feed = "iex",
  dataUrl = "https://data.alpaca.markets",
  tradingUrl = "https://paper-api.alpaca.markets",
  fetchImpl = fetch,
}) {
  const headers = {
    "APCA-API-KEY-ID": keyId || "",
    "APCA-API-SECRET-KEY": secretKey || "",
  };

  const request = (url) => fetchJson(url, { headers }, { fetchImpl });

  let assetCache = null;
  const calendarCache = new Map();

  function isConfigured() {
    return Boolean(keyId && secretKey);
  }

  // All active, tradable U.S. equity symbols (cached for 6 hours).
  async function getTradableSymbols() {
    if (assetCache && Date.now() - assetCache.timestamp < ASSET_CACHE_MS) {
      return assetCache.symbols;
    }

    const url = new URL(`${tradingUrl}/v2/assets`);
    url.searchParams.set("status", "active");
    url.searchParams.set("asset_class", "us_equity");

    const assets = await request(url);
    const symbols = assets
      .filter((asset) => asset.tradable && asset.exchange !== "OTC")
      .map((asset) => asset.symbol);

    assetCache = { symbols, timestamp: Date.now() };

    return symbols;
  }

  // Latest trade, daily bar and previous daily bar for many symbols.
  async function getSnapshots(symbols) {
    const batches = chunk(symbols, SNAPSHOT_BATCH_SIZE);

    const responses = await mapWithConcurrency(
      batches,
      SNAPSHOT_CONCURRENCY,
      (batch) => {
        const url = new URL(`${dataUrl}/v2/stocks/snapshots`);
        url.searchParams.set("symbols", batch.join(","));
        url.searchParams.set("feed", feed);

        return request(url);
      },
    );

    return Object.assign({}, ...responses);
  }

  // Trading days between two dates (cached for an hour per range).
  async function getCalendar(start, end) {
    const key = `${start}:${end}`;
    const cached = calendarCache.get(key);

    if (cached && Date.now() - cached.timestamp < CALENDAR_CACHE_MS) {
      return cached.days;
    }

    const url = new URL(`${tradingUrl}/v2/calendar`);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);

    const days = await request(url);

    calendarCache.clear();
    calendarCache.set(key, { days, timestamp: Date.now() });

    return days;
  }

  // Historical bars for many symbols, following pagination.
  // Returns { SYMBOL: [bar, ...] }.
  async function getBars(symbols, { timeframe, start, end }) {
    const barsBySymbol = {};

    for (const batch of chunk(symbols, BARS_BATCH_SIZE)) {
      let pageToken = null;

      do {
        const url = new URL(`${dataUrl}/v2/stocks/bars`);
        url.searchParams.set("symbols", batch.join(","));
        url.searchParams.set("timeframe", timeframe);
        url.searchParams.set("start", start);
        url.searchParams.set("end", end);
        url.searchParams.set("feed", feed);
        url.searchParams.set("limit", "10000");

        if (pageToken) {
          url.searchParams.set("page_token", pageToken);
        }

        const data = await request(url);

        for (const [symbol, bars] of Object.entries(data.bars || {})) {
          (barsBySymbol[symbol] ||= []).push(...bars);
        }

        pageToken = data.next_page_token;
      } while (pageToken);
    }

    return barsBySymbol;
  }

  // Recent news articles for one symbol.
  async function getNews(symbol, limit = 50) {
    const url = new URL(`${dataUrl}/v1beta1/news`);
    url.searchParams.set("symbols", symbol);
    url.searchParams.set("limit", String(limit));

    const data = await request(url);

    return data.news || [];
  }

  return {
    feed,
    isConfigured,
    getTradableSymbols,
    getSnapshots,
    getCalendar,
    getBars,
    getNews,
  };
}

module.exports = { createAlpacaClient, chunk, mapWithConcurrency };
