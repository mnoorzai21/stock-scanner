const { getTradingSession, toEasternDate } = require("./marketTime");
const { getRvolContext, computeRvol } = require("./rvol");
const { summarizeNews } = require("./news");
const { mapWithConcurrency } = require("./alpaca");

const CALENDAR_LOOKBACK_DAYS = 45;
const NEWS_CONCURRENCY = 4;

function daysBefore(date, days) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() - days);

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
    const session = getTradingSession(startedAt);
    const stats = {};
    const warnings = [];

    const report = (fields) => ({
      startedAt: startedAt.toISOString(),
      finishedAt: now().toISOString(),
      session: session?.session || null,
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

    if (!session) {
      return report({
        message:
          "Markets are closed. The scanner runs 4:00 AM-8:00 PM ET on trading days.",
      });
    }

    const marketDate = toEasternDate(startedAt);
    const calendar = await alpaca.getCalendar(
      daysBefore(marketDate, CALENDAR_LOOKBACK_DAYS),
      marketDate,
    );

    if (!calendar.some((day) => day.date === marketDate)) {
      return report({ message: "U.S. markets are closed today." });
    }

    // Stage 1: price and % gain from snapshots.
    const symbols = await alpaca.getTradableSymbols();
    const snapshots = await alpaca.getSnapshots(symbols);

    const priced = Object.entries(snapshots)
      .map(([symbol, snapshot]) => evaluateSnapshot(symbol, snapshot, marketDate))
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
    const rvolContext = getRvolContext(startedAt, calendar);

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

    const highRvol = movers
      .map((stock) => {
        const rvol = computeRvol(bars[stock.symbol], rvolContext);

        return rvol && { ...stock, ...rvol };
      })
      .filter((stock) => stock && stock.rvol > criteria.minRvol);

    stats.rvol = highRvol.length;

    // Stage 3: share float.
    let floatData = new Map();

    if (!floats.isConfigured()) {
      warnings.push(
        "MASSIVE_API_KEY is not set, so the float filter can't run and no stocks can qualify.",
      );
    } else if (highRvol.length > 0) {
      try {
        floatData = await floats.getFloats(highRvol.map((stock) => stock.symbol));
      } catch (error) {
        warnings.push(`Float lookup failed: ${error.message}`);
      }
    }

    const lowFloat = highRvol
      .map((stock) => {
        const data = floatData.get(stock.symbol);

        return data
          ? { ...stock, float: data.float, floatMillions: data.floatMillions }
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
