const test = require("node:test");
const assert = require("node:assert/strict");

const { createAlpacaClient } = require("../src/alpaca");
const { createFloatProvider } = require("../src/float");

const json = (body) => new Response(JSON.stringify(body), { status: 200 });

test("Alpaca client batches snapshots and follows bar pagination", async () => {
  const requests = [];

  const alpaca = createAlpacaClient({
    keyId: "key",
    secretKey: "secret",
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      requests.push(parsed);
      assert.equal(options.headers["APCA-API-KEY-ID"], "key");

      if (parsed.pathname === "/v2/stocks/snapshots") {
        const symbols = parsed.searchParams.get("symbols").split(",");
        return json(Object.fromEntries(symbols.map((s) => [s, { symbol: s }])));
      }

      if (parsed.pathname === "/v2/stocks/bars") {
        return parsed.searchParams.get("page_token")
          ? json({ bars: { AAA: [{ v: 2 }], BBB: [{ v: 3 }] }, next_page_token: null })
          : json({ bars: { AAA: [{ v: 1 }] }, next_page_token: "page2" });
      }

      throw new Error(`Unexpected ${parsed.pathname}`);
    },
  });

  const symbols = Array.from({ length: 450 }, (_, i) => `S${i}`);
  const snapshots = await alpaca.getSnapshots(symbols);
  assert.equal(Object.keys(snapshots).length, 450);
  assert.equal(requests.filter((r) => r.pathname.endsWith("snapshots")).length, 3);
  assert.equal(requests[0].searchParams.get("feed"), "iex");

  const bars = await alpaca.getBars(["AAA", "BBB"], { timeframe: "5Min", start: "a", end: "b" });
  assert.deepEqual(bars, { AAA: [{ v: 1 }, { v: 2 }], BBB: [{ v: 3 }] });
});

test("float provider looks up many tickers at once and caches results", async () => {
  const requests = [];

  const floats = createFloatProvider({
    apiKey: "massive-key",
    minIntervalMs: 0,
    fetchImpl: async (url, options) => {
      requests.push(new URL(url));
      assert.equal(options.headers.Authorization, "Bearer massive-key");

      return json({
        results: [
          { ticker: "AAA", free_float: 12_345_678, free_float_percent: 80, effective_date: "2026-10-01" },
        ],
      });
    },
  });

  const first = await floats.getFloats(["aaa", "BBB"]);
  assert.equal(first.get("AAA").floatMillions, 12.35);
  assert.equal(first.get("BBB"), null);
  assert.equal(requests[0].searchParams.get("ticker.any_of"), "AAA,BBB");

  // Second lookup is served from the cache.
  await floats.getFloats(["AAA", "BBB"]);
  assert.equal(requests.length, 1);
});

test("float provider refuses to run without an API key", async () => {
  const floats = createFloatProvider({ apiKey: "" });

  assert.equal(floats.isConfigured(), false);
  await assert.rejects(floats.getFloats(["AAA"]), /MASSIVE_API_KEY/);
});
