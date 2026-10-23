const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateSnapshot,
  createScanner,
  createScanService,
} = require("../src/scanner");
const { weekdayCalendar, bars } = require("./helpers");

const criteria = {
  minPrice: 1,
  maxPrice: 20,
  minChangePercent: 20,
  minRvol: 5,
  minNoHistoryVolume: 20_000,
  maxFloat: 20_000_000,
  newsMaxAgeHours: 24,
};

const TODAY = "2026-10-15";
const YESTERDAY = "2026-10-14";
const REGULAR_OPEN = 9 * 60 + 30;
// 10:02 AM ET on a Thursday.
const NOW = new Date("2026-10-15T14:02:00Z");

const dayBar = (date, close, volume = 0) => ({ t: `${date}T04:00:00Z`, c: close, v: volume });
const trade = (price, at = "2026-10-15T14:01:30Z") => ({ p: price, t: at });

test("uses yesterday's close during premarket, before today's daily bar exists", () => {
  // Premarket: Alpaca's dailyBar is still yesterday's bar.
  const stock = evaluateSnapshot(
    "ABCD",
    {
      latestTrade: trade(6, "2026-10-15T12:00:00Z"),
      dailyBar: dayBar(YESTERDAY, 4),
      prevDailyBar: dayBar("2026-10-13", 2),
    },
    TODAY,
  );

  assert.equal(stock.previousClose, 4);
  assert.equal(stock.change, 50); // not +200% against the day before yesterday
});

test("uses prevDailyBar once today's daily bar exists", () => {
  const stock = evaluateSnapshot(
    "ABCD",
    {
      latestTrade: trade(6),
      dailyBar: dayBar(TODAY, 6, 500000),
      prevDailyBar: dayBar(YESTERDAY, 5),
    },
    TODAY,
  );

  assert.equal(stock.change, 20);
  assert.equal(stock.dayVolume, 500000);
});

test("ignores symbols whose last trade is not from today", () => {
  const stock = evaluateSnapshot(
    "OLD",
    {
      latestTrade: trade(6, "2026-10-14T19:59:00Z"),
      dailyBar: dayBar(YESTERDAY, 6),
      prevDailyBar: dayBar("2026-10-13", 3),
    },
    TODAY,
  );

  assert.equal(stock, null);
});

// A fake market where each symbol fails exactly one filter, except WINNER.
function fakeMarket() {
  const calendar = weekdayCalendar("2026-08-31", TODAY);
  const history = calendar.map((day) => day.date).filter((date) => date < TODAY).slice(-20);

  const snapshot = (price, prevClose) => ({
    latestTrade: trade(price),
    dailyBar: dayBar(TODAY, price, 1_000_000),
    prevDailyBar: dayBar(YESTERDAY, prevClose),
  });

  const snapshots = {
    WINNER: snapshot(6, 4), // +50%
    BIGWIN: snapshot(9, 5), // +80%
    SMALLGAIN: snapshot(5.5, 5), // +10%: fails gain
    PRICEY: snapshot(30, 20), // fails price
    LOWRVOL: snapshot(6, 4),
    BIGFLOAT: snapshot(6, 4),
    NOFLOAT: snapshot(6, 4),
    OLDNEWS: snapshot(6, 4),
    NEWSERR: snapshot(6, 4),
    NEWACTIVE: snapshot(7, 4), // +75%, no volume history, heavy volume today
    QUIETNEW: snapshot(6, 4), // no volume history, too little volume today
    SESSIONBASIS: snapshot(6.4, 4), // +60%, past volume only later in the day
  };

  // Normal volume: 1,000 shares per 5-minute bar. Today: 10,000 (10x RVOL).
  const barsFor = (todayVolume) => [
    ...history.flatMap((date) => bars(date, REGULAR_OPEN, 6, 1000)),
    ...bars(TODAY, REGULAR_OPEN, 6, todayVolume),
  ];

  const allBars = {
    WINNER: barsFor(10000),
    BIGWIN: barsFor(20000),
    LOWRVOL: barsFor(2000),
    BIGFLOAT: barsFor(10000),
    NOFLOAT: barsFor(10000),
    OLDNEWS: barsFor(10000),
    NEWSERR: barsFor(10000),
    NEWACTIVE: bars(TODAY, REGULAR_OPEN, 6, 10000), // 60,000 shares, no history
    QUIETNEW: bars(TODAY, REGULAR_OPEN, 6, 100), // 600 shares, no history
    // Past days only traded in the afternoon (6,000 shares per day), so the
    // 9:30-10:00 window is empty and the full session is used instead.
    SESSIONBASIS: [
      ...history.flatMap((date) => bars(date, 13 * 60, 6, 1000)),
      ...bars(TODAY, REGULAR_OPEN, 6, 10000),
    ],
  };

  const floatsBySymbol = {
    WINNER: 8_000_000,
    BIGWIN: 3_000_000,
    BIGFLOAT: 90_000_000,
    OLDNEWS: 5_000_000,
    NEWSERR: 5_000_000,
    NEWACTIVE: 4_000_000,
    QUIETNEW: 4_000_000,
    SESSIONBASIS: 4_000_000,
  };

  const freshNews = (symbol) => [
    { headline: `${symbol} announces contract`, created_at: "2026-10-15T12:00:00Z", source: "test", url: "https://example.com" },
  ];

  const calls = { bars: [], floats: [] };

  const alpaca = {
    feed: "iex",
    isConfigured: () => true,
    getCalendar: async () => calendar,
    getTradableSymbols: async () => Object.keys(snapshots),
    getSnapshots: async () => snapshots,
    getBars: async (symbols, range) => {
      calls.bars.push({ symbols, range });
      return Object.fromEntries(symbols.map((s) => [s, allBars[s] || []]));
    },
    getNews: async (symbol) => {
      if (symbol === "NEWSERR") throw new Error("boom");
      if (symbol === "OLDNEWS") {
        return [{ headline: "Old news", created_at: "2026-10-10T12:00:00Z" }];
      }
      return freshNews(symbol);
    },
  };

  const floats = {
    isConfigured: () => true,
    getFloats: async (symbols) => {
      calls.floats.push(symbols);
      return new Map(
        symbols.map((s) => [
          s,
          floatsBySymbol[s]
            ? { float: floatsBySymbol[s], floatMillions: floatsBySymbol[s] / 1e6 }
            : null,
        ]),
      );
    },
  };

  return { alpaca, floats, calls };
}

test("full scan keeps only stocks that pass all five filters", async () => {
  const { alpaca, floats, calls } = fakeMarket();
  const scanner = createScanner({ alpaca, floats, criteria, now: () => NOW });

  const report = await scanner.scan();

  assert.deepEqual(
    report.results.map((stock) => stock.symbol),
    ["BIGWIN", "NEWACTIVE", "SESSIONBASIS", "WINNER"], // sorted by % change
  );

  const winner = report.results[3];
  assert.equal(winner.change, 50);
  assert.equal(winner.rvol, 10);
  assert.equal(winner.floatMillions, 8);
  assert.equal(winner.headline, "WINNER announces contract");
  assert.equal(winner.basis, "window");

  const newActive = report.results[1];
  assert.equal(newActive.noHistory, true);
  assert.equal(newActive.rvol, null);
  assert.equal(newActive.sessionVolume, 60000);

  const sessionBasis = report.results[2];
  assert.equal(sessionBasis.basis, "session");
  assert.equal(sessionBasis.rvol, 10);

  assert.equal(report.session, "regular");
  assert.deepEqual(report.stats, {
    symbolsScanned: 12,
    tradedToday: 12,
    priceAndGain: 10,
    rvol: 8,
    rvolNoHistory: 1,
    missingRvolHistory: 1,
    missingFloat: 1,
    float: 6,
    news: 4,
  });
  assert.match(report.warnings[0], /News lookup failed for 1/);

  // Bars for all candidates come from one batched request.
  assert.equal(calls.bars.length, 1);
  assert.equal(calls.floats.length, 1);
});

test("warns when the float API key is missing", async () => {
  const { alpaca, floats } = fakeMarket();
  floats.isConfigured = () => false;

  const report = await createScanner({ alpaca, floats, criteria, now: () => NOW }).scan();

  assert.equal(report.results.length, 0);
  assert.match(report.warnings[0], /MASSIVE_API_KEY/);
});

test("skips the market data calls when markets are closed", async () => {
  const { alpaca, floats } = fakeMarket();
  alpaca.getSnapshots = async () => assert.fail("should not fetch snapshots");

  const report = await createScanner({
    alpaca,
    floats,
    criteria,
    now: () => new Date("2026-10-15T02:00:00Z"),
  }).scan();

  assert.equal(report.session, null);
  assert.match(report.message, /Markets are closed/);
});

test("reports markets closed on weekends even during regular hours", async () => {
  const { alpaca, floats } = fakeMarket();
  alpaca.getCalendar = async () => weekdayCalendar("2026-09-01", "2026-10-28");
  alpaca.getSnapshots = async () => assert.fail("should not fetch snapshots");

  const report = await createScanner({
    alpaca,
    floats,
    criteria,
    // Sunday, October 18, 2026 at 11:56 AM ET.
    now: () => new Date("2026-10-18T15:56:00Z"),
  }).scan();

  assert.equal(report.session, null);
  assert.equal(report.nextOpen, "2026-10-19T08:00:00.000Z");
  assert.equal(report.message, "U.S. markets are closed today.");
});

test("scan service shares one in-flight scan and caches the result", async () => {
  let scans = 0;
  let finish;
  const scanner = {
    scan: () => {
      scans++;
      return new Promise((resolve) => {
        finish = () => resolve({ results: [{ symbol: "WINNER" }], finishedAt: new Date().toISOString() });
      });
    },
  };

  const service = createScanService({ scanner, log: () => {} });

  const first = service.runScan();
  const second = service.runScan();
  assert.equal(service.getState().scanning, true);
  assert.equal(service.requestScan(), false);

  finish();
  await Promise.all([first, second]);

  assert.equal(scans, 1);
  assert.equal(service.getState().scanning, false);
  assert.equal(service.getState().lastScan.results[0].symbol, "WINNER");
  // Manual scans are rate-limited right after a scan.
  assert.equal(service.requestScan(), false);
});

test("scan service records errors without crashing", async () => {
  const service = createScanService({
    scanner: { scan: async () => { throw new Error("Alpaca down"); } },
    log: () => {},
  });

  await assert.rejects(service.runScan(), /Alpaca down/);
  assert.equal(service.getState().lastError.message, "Alpaca down");
});
