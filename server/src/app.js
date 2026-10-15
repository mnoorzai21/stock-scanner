const express = require("express");
const cors = require("cors");

const { getTradingSession, toEasternDate } = require("./marketTime");
const { getRvolContext, computeRvol } = require("./rvol");
const { summarizeNews } = require("./news");

const SYMBOL_PATTERN = /^[A-Z][A-Z.]{0,9}$/;

function parseSymbol(req, res) {
  const symbol = String(req.params.symbol || "").toUpperCase();

  if (!SYMBOL_PATTERN.test(symbol)) {
    res.status(400).json({ error: `Invalid symbol "${req.params.symbol}"` });
    return null;
  }

  return symbol;
}

function sendError(res, error, fallback) {
  console.error(fallback, error);
  res.status(error.status === 401 || error.status === 403 ? 502 : 500).json({
    error: `${fallback}: ${error.message}`,
  });
}

function createApp({ service, alpaca, floats, config }) {
  const app = express();

  app.use(cors());

  app.get("/", (req, res) => {
    res.send("Stock Scanner API is running");
  });

  // Quick configuration check (never returns secret values).
  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      alpacaConfigured: alpaca.isConfigured(),
      massiveConfigured: floats.isConfigured(),
      feed: alpaca.feed,
      session: getTradingSession(new Date())?.session || null,
      criteria: config.criteria,
    });
  });

  // Latest cached scan. The dashboard polls this.
  app.get("/api/scanner", (req, res) => {
    service.touch();
    service.tick();
    res.json(service.getState());
  });

  // "Scan Now" button.
  app.post("/api/scan", (req, res) => {
    const started = service.requestScan();
    res.status(started ? 202 : 200).json({ started, ...service.getState() });
  });

  // Runs a scan and waits for the result. Kept for backward compatibility.
  app.get("/api/test-scanner", async (req, res) => {
    try {
      service.touch();
      const result = await service.runScan();
      res.json(result.results);
    } catch (error) {
      sendError(res, error, "Failed to run stock scanner");
    }
  });

  // --- Diagnostics for a single symbol ---------------------------------

  app.get("/api/test-float/:symbol", async (req, res) => {
    const symbol = parseSymbol(req, res);
    if (!symbol) return;

    try {
      res.json(await floats.getFloat(symbol));
    } catch (error) {
      sendError(res, error, "Failed to fetch float data");
    }
  });

  app.get("/api/test-news/:symbol", async (req, res) => {
    const symbol = parseSymbol(req, res);
    if (!symbol) return;

    try {
      const articles = await alpaca.getNews(symbol);
      res.json(
        summarizeNews(articles, {
          symbol,
          maxAgeHours: config.criteria.newsMaxAgeHours,
        }),
      );
    } catch (error) {
      sendError(res, error, "Failed to fetch stock news");
    }
  });

  app.get("/api/test-rvol/:symbol", async (req, res) => {
    const symbol = parseSymbol(req, res);
    if (!symbol) return;

    try {
      const now = new Date();
      const marketDate = toEasternDate(now);
      const start = new Date(now.getTime() - 45 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const calendar = await alpaca.getCalendar(start, marketDate);
      const context = getRvolContext(now, calendar);

      if (!context.windows) {
        return res.json({ symbol, message: context.reason });
      }

      const bars = await alpaca.getBars([symbol], {
        timeframe: "5Min",
        start: context.rangeStart,
        end: context.rangeEnd,
      });
      const rvol = computeRvol(bars[symbol], context);

      res.json({
        symbol,
        session: context.session.session,
        elapsedMinutes: context.elapsedMinutes,
        ...(rvol || { message: "No historical volume for this window." }),
      });
    } catch (error) {
      sendError(res, error, "Failed to calculate RVOL");
    }
  });

  return app;
}

module.exports = { createApp };
