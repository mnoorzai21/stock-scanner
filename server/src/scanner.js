const { getMarketStatus, toEasternDate } = require("./marketTime");
const { getRvolContext, computeRvol } = require("./rvol");
const { summarizeNews } = require("./news");
const { getFloatWarnings } = require("./float");
const { mapWithConcurrency } = require("./alpaca");

const CALENDAR_LOOKBACK_DAYS = 45;
// Far enough ahead to find the next open across a weekend plus holidays.
const CALENDAR_LOOKAHEAD_DAYS = 10;
const NEWS_CONCURRENCY = 4;

function addDays(date, days) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);

  return result.toISOString().slice(0, 10);
}

// Turn an Alpaca snapshot into price and % change, or null when the data
// can't be trusted (no trade today, or no previous close).
function evaluateSnapshot(symbol, snapshot, marketDate) {
  const trade = snapshot?.latestTrade;

  if (!trade || !(trade.p > 0) || !trade.t) {
    return null;
  }

  // Ignore stale prices from symbols that haven't traded today.
  if (toEasternDate(trade.t) !== marketDate) {
    return null;
  }

  const dailyBar = snapshot.dailyBar;
  const prevDailyBar = snapshot.prevDailyBar;
  const dailyBarIsToday =
    Boolean(dailyBar?.t) && toEasternDate(dailyBar.t) === marketDate;

  // Before the open, Alpaca's dailyBar is still yesterday's bar, so
  // yesterday's close is dailyBar.c (not prevDailyBar.c).
  const previousClose = dailyBarIsToday ? prevDailyBar?.c : dailyBar?.c;

  if (!(previousClose > 0)) {
    return null;
  }

  return {
    symbol,
    price: trade.p,
    previousClose,
    change: Number((((trade.p - previousClose) / previousClose) * 100).toFixed(2)),
    dayVolume: dailyBarIsToday ? dailyBar.v : null,
    lastTradeAt: trade.t,
  };
}

function createScanner({
  alpaca,
  floats,
  criteria,
  now = () => new Date(),
  log = () => {},
}) {
  async function scan() {
    const startedAt = now();
    const marketDate = toEasternDate(startedAt);
    let session = null;
    let nextOpen = null;
    const stats = {};
    const warnings = [];

    const report = (fields) => ({
      startedAt: startedAt.toISOString(),
      finishedAt: now().toISOString(),
      session: session?.session || null,
      nextOpen,
      feed: alpaca.feed,
      criteria,
      stats,
      warnings,
      message: null,
      results: [],
      ...fields,
    });

    if (!alpaca.isConfigured()) {
      throw new Error("ALPACA_API_KEY and ALPACA_SECRET_KEY must be set");
    }

    // The trading calendar decides whether markets are open, so weekends
    // and holidays show as closed instead of going by the clock alone.
    const calendar = await alpaca.getCalendar(
      addDays(marketDate, -CALENDAR_LOOKBACK_DAYS),
      addDays(marketDate, CALENDAR_LOOKAHEAD_DAYS),
    );

    ({ session, nextOpen } = getMarketStatus(startedAt, calendar));

    if (!calendar.some((day) => day.date === marketDate)) {
      return report({ message: "U.S. markets are closed today." });
    }

    if (!session) {
      return report({
        message:
          "Markets are closed. The scanner runs 4:00 AM-8:00 PM ET on trading days.",
      });
    }

    // Stage 1: price and % gain from snapshots.
    const symbols = await alpaca.getTradableSymbols();
    const snapshots = await alpaca.getSnapshots(symbols);

    const priced = Object.entries(snapshots)
      .map(([symbol, snapshot]) =>
        evaluateSnapshot(symbol, snapshot, marketDate),
      )
      .filter(Boolean);

    const movers = priced.filter(
      (stock) =>
        stock.price >= criteria.minPrice &&
        stock.price <= criteria.maxPrice &&
        stock.change >= criteria.minChangePercent,
    );

    stats.symbolsScanned = symbols.length;
    stats.tradedToday = priced.length;
    stats.priceAndGain = movers.length;

    // Stage 2: relative volume.
    const rvolContext = getRvolContext(startedAt, calendar, session);

    if (!rvolContext.windows) {
      return report({ message: rvolContext.reason });
    }

    const bars = movers.length
      ? await alpaca.getBars(
          movers.map((stock) => stock.symbol),
          {
            timeframe: "5Min",
            start: rvolContext.rangeStart,
            end: rvolContext.rangeEnd,
          },
        )
      : {};

    const withRvol = movers.map((stock) => {
      const rvol = computeRvol(bars[stock.symbol], rvolContext, {
        minNoHistoryVolume: criteria.minNoHistoryVolume,
      });

      return { stock, rvol };
    });

    // A stock with no volume history on this feed can't have a real RVOL,
    // but heavy volume today means it's waking up, so it passes (shown as
    // "New" in the dashboard) instead of being silently dropped.
    const highRvol = withRvol
      .filter(
        ({ rvol }) => rvol && (rvol.noHistory || rvol.rvol > criteria.minRvol),
      )
      .map(({ stock, rvol }) => ({ ...stock, ...rvol }));

    stats.rvol = highRvol.length;
    // Passed RVOL with no volume history (included in stats.rvol).
    stats.rvolNoHistory = highRvol.filter((stock) => stock.noHistory).length;
    // Dropped because there was no history and too little volume today.
    stats.missingRvolHistory = withRvol.filter(({ rvol }) => !rvol).length;

    // Stage 3: share float.
    let floatData = new Map();

    if (!floats.isConfigured()) {
      warnings.push(
        "MASSIVE_API_KEY is not set, so the float filter can't run and no stocks can qualify.",
      );
    } else if (highRvol.length > 0) {
      try {
        floatData = await floats.getFloats(
          highRvol.map((stock) => stock.symbol),
        );
      } catch (error) {
        warnings.push(`Float lookup failed: ${error.message}`);
      }
    }

    const lowFloat = highRvol
      .map((stock) => {
        const data = floatData.get(stock.symbol);

        return data
          ? {
              ...stock,
              float: data.float,
              floatMillions: data.floatMillions,
              freeFloatPercent: data.freeFloatPercent,
              floatEffectiveDate: data.floatEffectiveDate,
              floatWarnings: getFloatWarnings(data, {
                minFreeFloatPercent: criteria.minFreeFloatPercent,
                maxFloatAgeDays: criteria.maxFloatAgeDays,
                now: startedAt.getTime(),
              }),
            }
          : null;
      })
      .filter((stock) => stock && stock.float < criteria.maxFloat);

    // Massive returned no float for these symbols.
    stats.missingFloat = highRvol.filter(
      (stock) => floatData.has(stock.symbol) && !floatData.get(stock.symbol),
    ).length;
    stats.float = lowFloat.length;

    // Stage 4: fresh news catalyst.
    let newsFailures = 0;

    const withNews = await mapWithConcurrency(
      lowFloat,
      NEWS_CONCURRENCY,
      async (stock) => {
        try {
          const articles = await alpaca.getNews(stock.symbol);
          const news = summarizeNews(articles, {
            symbol: stock.symbol,
            now: startedAt.getTime(),
            maxAgeHours: criteria.newsMaxAgeHours,
          });

          return {
            ...stock,
            hasNews: news.hasNews,
            isFreshNews: news.isFresh,
            newsAgeInHours: news.ageInHours,
            headline: news.headline,
            newsSource: news.source,
            newsUrl: news.url,
            newsCreatedAt: news.createdAt,
          };
        } catch (error) {
          newsFailures++;
          log(`News lookup failed for ${stock.symbol}: ${error.message}`);

          return null;
        }
      },
    );

    if (newsFailures > 0) {
      warnings.push(`News lookup failed for ${newsFailures} stock(s).`);
    }

    const results = withNews
      .filter((stock) => stock?.isFreshNews)
      .sort((a, b) => b.change - a.change);

    stats.news = results.length;

    // Results shown with a ⚠ because their float data looks unreliable
    // (included in stats.news).
    stats.floatFlagged = results.filter(
      (stock) => stock.floatWarnings.length > 0,
    ).length;

    log("Scan complete", { session: session.session, ...stats });

    return report({ results });
  }

  return { scan };
}

// Runs scans in the background and keeps the latest result in memory, so
// every browser tab reads the same cached result instead of starting its
// own expensive scan.
function createScanService({
  scanner,
  intervalMs = 60_000,
  idleTimeoutMs = 10 * 60_000,
  manualCooldownMs = 15_000,
  log = console.log,
}) {
  let lastScan = null;
  let lastError = null;
  let lastAttemptAt = 0;
  let lastRequestAt = 0;
  let inFlight = null;
  let timer = null;

  function runScan() {
    if (inFlight) {
      return inFlight;
    }

    const started = Date.now();
    lastAttemptAt = started;

    inFlight = scanner
      .scan()
      .then((result) => {
        lastScan = { ...result, durationMs: Date.now() - started };
        lastError = null;

        return lastScan;
      })
      .catch((error) => {
        lastError = { message: error.message, at: new Date().toISOString() };
        log(`Scan failed: ${error.message}`);

        throw error;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  function startInBackground() {
    runScan().catch(() => {});
  }

  // Called by the dashboard. Keeps the background loop alive.
  function touch() {
    lastRequestAt = Date.now();
  }

  function tick() {
    const isWatched = Date.now() - lastRequestAt <= idleTimeoutMs;
    const isDue = Date.now() - lastAttemptAt >= intervalMs;

    if (isWatched && isDue && !inFlight) {
      startInBackground();
    }
  }

  // Manual "Scan Now". Returns false if a scan just ran.
  function requestScan() {
    touch();

    if (inFlight || Date.now() - lastAttemptAt < manualCooldownMs) {
      return false;
    }

    startInBackground();

    return true;
  }

  function getState() {
    return {
      scanning: Boolean(inFlight),
      scanIntervalMs: intervalMs,
      lastScan,
      lastError,
    };
  }

  function start(pollMs = 5000) {
    timer = setInterval(tick, pollMs);
    timer.unref?.();
  }

  function stop() {
    clearInterval(timer);
  }

  return { runScan, touch, tick, requestScan, getState, start, stop };
}

module.exports = { evaluateSnapshot, createScanner, createScanService };
