require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

const PORT = process.env.PORT || 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options) {
  let response;

  try {
    // Send the initial API request.
    response = await fetch(url, options);
  } catch (error) {
    // Retry once after a temporary network failure.
    console.log("Network request failed. Retrying in 3 seconds...");

    await sleep(3000);

    response = await fetch(url, options);
  }

  // Retry once if the API responds with HTTP 429 (rate limit exceeded).
  if (response.status === 429) {
    // Read the server's recommended waiting time, if provided.
    const retryAfter = response.headers.get("Retry-After");
    const retrySeconds = Number(retryAfter);
    const retryDate = Date.parse(retryAfter);

    // Support Retry-After values expressed as seconds or an HTTP date.
    // Default to 5 seconds when the header is missing or invalid.
    const calculatedDelay =
      retryAfter !== null && Number.isFinite(retrySeconds) && retrySeconds >= 0
        ? retrySeconds * 1000
        : retryAfter !== null && Number.isFinite(retryDate)
          ? Math.max(0, retryDate - Date.now())
          : 5000;

    // Limit the waiting time to 60 seconds.
    const retryDelay = Math.min(calculatedDelay, 60000);

    // Log the rate-limited API hostname and retry delay without exposing credentials.
    console.log(
      `API rate limit detected for ${new URL(url).hostname}. Retrying in ${retryDelay / 1000} seconds...`,
    );

    // Wait before retrying the rate-limited request.
    await sleep(retryDelay);

    try {
      response = await fetch(url, options);
    } catch (error) {
      // Allow one final attempt if the rate-limit retry has a network failure.
      console.log(
        "Network failure during rate-limit retry. Retrying in 3 seconds...",
      );

      await sleep(3000);

      response = await fetch(url, options);
    }
  }

  // Return the response so the caller can validate its status.
  return response;
}

app.get("/", (req, res) => {
  res.send("Stock Scanner API is running");
});

app.get("/api/test-alpaca", async (req, res) => {
  try {
    const response = await fetch(
      "https://data.alpaca.markets/v2/stocks/AAPL/trades/latest",
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      },
    );

    const data = await response.json();

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to get Alpaca market data",
    });
  }
});

app.get("/api/test-snapshot", async (req, res) => {
  try {
    const response = await fetch(
      "https://data.alpaca.markets/v2/stocks/AAPL/snapshot",
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      },
    );

    const data = await response.json();

    const currentPrice = data.latestTrade.p;
    const previousClose = data.prevDailyBar.c;

    const percentChange =
      ((currentPrice - previousClose) / previousClose) * 100;

    res.json({
      symbol: data.symbol,
      currentPrice: currentPrice,
      previousClose: previousClose,
      percentChange: Number(percentChange.toFixed(2)),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to get Alpaca snapshot data",
    });
  }
});

app.get("/api/test-volume", async (req, res) => {
  try {
    const response = await fetch(
      "https://data.alpaca.markets/v2/stocks/AAPL/bars?timeframe=1Day&start=2026-09-01&feed=iex",
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      },
    );

    const data = await response.json();

    const volumes = data.bars.map((bar) => bar.v);

    const totalVolume = volumes.reduce((sum, volume) => {
      return sum + volume;
    }, 0);

    const averageVolume = totalVolume / volumes.length;

    const snapshotResponse = await fetch(
      "https://data.alpaca.markets/v2/stocks/AAPL/snapshot?feed=iex",
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      },
    );

    const snapshotData = await snapshotResponse.json();

    const currentVolume = snapshotData.dailyBar.v;

    res.json({
      symbol: data.symbol,
      numberOfDays: volumes.length,
      averageVolume: Math.round(averageVolume),
      currentVolume: currentVolume,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to get historical volume data",
    });
  }
});

function getMarketOpenUtc(date) {
  const noonUtc = new Date(`${date}T12:00:00Z`);

  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(noonUtc)
    .find((part) => part.type === "timeZoneName").value;

  const offsetHours = Number(timeZoneName.replace("GMT", ""));
  const marketOpenUtcHour = 9 - offsetHours;
  const marketEndUtcHour = marketOpenUtcHour + 1;

  return {
    start: `${date}T${String(marketOpenUtcHour).padStart(2, "0")}:30:00Z`,
    end: `${date}T${String(marketEndUtcHour).padStart(2, "0")}:00:00Z`,
  };
}

async function getNews(symbol) {
  const response = await fetchWithRetry(
    `https://data.alpaca.markets/v1beta1/news?symbols=${encodeURIComponent(symbol)}&limit=50`,
    {
      headers: {
        "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Alpaca news request failed for ${symbol}: ${response.status}`,
    );
  }

  const data = await response.json();
  const articles = data.news || [];

  // Exclude generic market-mover articles.
  const genericPatterns = [
    /\bstocks moving\b/i,
    /\bstocks are moving\b/i,
    /\bpre-market session\b/i,
    /\bafter-market session\b/i,
    /\bintraday session\b/i,
    /\bbiggest gainers\b/i,
    /\bbiggest losers\b/i,
    /\btop gainers\b/i,
    /\btop losers\b/i,
    /\bmarket movers\b/i,
    /\bwhy .* stock is (up|down|moving)\b/i,
  ];

  const now = Date.now();

  // Keep only fresh, non-generic articles.
  const relevantArticles = articles.filter((article) => {
    const headline = article.headline || "";

    const ageInHours =
      (now - new Date(article.created_at).getTime()) / (1000 * 60 * 60);

    const isFresh =
      Number.isFinite(ageInHours) && ageInHours >= 0 && ageInHours <= 24;

    const isGeneric = genericPatterns.some((pattern) => pattern.test(headline));

    return isFresh && !isGeneric;
  });

  // No qualifying article found.
  if (relevantArticles.length === 0) {
    return {
      hasNews: articles.length > 0,
      isFresh: false,
      ageInHours: null,
      headline: null,
      createdAt: null,
      source: null,
      url: null,
    };
  }

  // Select the newest qualifying article.
  const latestNews = relevantArticles.reduce((newest, article) =>
    new Date(article.created_at) > new Date(newest.created_at)
      ? article
      : newest,
  );

  const ageInHours =
    (now - new Date(latestNews.created_at).getTime()) / (1000 * 60 * 60);

  return {
    hasNews: true,
    isFresh: true,
    ageInHours: Number(ageInHours.toFixed(2)),
    headline: latestNews.headline,
    createdAt: latestNews.created_at,
    source: latestNews.source,
    url: latestNews.url,
  };
}

const floatCache = new Map();
const FLOAT_CACHE_DURATION = 24 * 60 * 60 * 1000;

let nextFloatRequestTime = 0;
let floatRequestQueue = Promise.resolve();

function waitForFloatRateLimit() {
  const scheduled = floatRequestQueue.then(async () => {
    const now = Date.now();

    const waitTime = Math.max(0, nextFloatRequestTime - now);

    if (waitTime > 0) {
      await sleep(waitTime);
    }

    nextFloatRequestTime = Date.now() + 15000;
  });

  floatRequestQueue = scheduled.catch(() => {});

  return scheduled;
}

async function getFloat(symbol) {
  symbol = symbol.toUpperCase();

  // Step 1: Check cached float data.
  const cached = floatCache.get(symbol);

  if (cached && Date.now() - cached.timestamp < FLOAT_CACHE_DURATION) {
    return cached.data;
  }

  // Step 2: Respect Massive's API rate limit.
  await waitForFloatRateLimit();

  // Step 3: Build the Massive API request.
  const url = new URL("https://api.massive.com/stocks/vX/float");

  url.searchParams.set("ticker", symbol);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.MASSIVE_API_KEY}`,
    },
  });

  // Step 4: Handle API errors.
  if (!response.ok) {
    throw new Error(
      `Massive float request failed for ${symbol}: ${response.status}`,
    );
  }

  // Step 5: Read the float data.
  const data = await response.json();

  const result = data.results?.find((stock) => stock.ticker === symbol);

  if (!result || !Number.isFinite(result.free_float)) {
    return null;
  }

  // Step 6: Format the float information.
  const floatData = {
    symbol: result.ticker,
    float: result.free_float,
    floatMillions: Number((result.free_float / 1_000_000).toFixed(2)),
    floatEffectiveDate: result.effective_date,
    freeFloatPercent: result.free_float_percent,
  };

  // Step 7: Save the result in the cache.
  floatCache.set(symbol, {
    data: floatData,
    timestamp: Date.now(),
  });

  return floatData;
}

function getEasternTimeUtc(date, hour, minute = 0) {
  const noonUtc = new Date(`${date}T12:00:00Z`);

  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  })
    .formatToParts(noonUtc)
    .find((part) => part.type === "timeZoneName").value;

  const offsetHours = Number(timeZoneName.replace("GMT", ""));

  const utcTime = new Date(`${date}T00:00:00Z`);

  utcTime.setUTCHours(hour - offsetHours, minute, 0, 0);

  return utcTime.toISOString();
}

function getTradingSession(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = Number(parts.find((part) => part.type === "hour").value);

  const minute = Number(parts.find((part) => part.type === "minute").value);

  const minutes = hour * 60 + minute;

  if (minutes >= 240 && minutes < 570) {
    return {
      session: "premarket",
      startMinutes: 240,
      endMinutes: 570,
    };
  }

  if (minutes >= 570 && minutes < 960) {
    return {
      session: "regular",
      startMinutes: 570,
      endMinutes: 960,
    };
  }

  if (minutes >= 960 && minutes < 1200) {
    return {
      session: "afterhours",
      startMinutes: 960,
      endMinutes: 1200,
    };
  }

  return null;
}

async function calculateRvol(symbol) {
  const now = new Date();
  const session = getTradingSession(now);

  console.log("RVOL DEBUG:", {
    symbol,
    currentTime: now.toISOString(),
    session,
  });

  // Outside supported trading hours.
  if (!session) {
    return null;
  }

  const marketDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const calendarStartDate = new Date(`${marketDate}T12:00:00Z`);

  calendarStartDate.setUTCDate(calendarStartDate.getUTCDate() - 45);

  const calendarStart = calendarStartDate.toISOString().slice(0, 10);

  const headers = {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
  };

  const calendarResponse = await fetchWithRetry(
    `https://paper-api.alpaca.markets/v2/calendar?start=${calendarStart}&end=${marketDate}`,
    { headers },
  );

  if (!calendarResponse.ok) {
    throw new Error(
      `Alpaca calendar request failed: ${calendarResponse.status}`,
    );
  }

  const calendar = await calendarResponse.json();

  // Do not calculate live RVOL on weekends or holidays.
  if (!calendar.some((day) => day.date === marketDate)) {
    return null;
  }

  const historicalDates = calendar
    .map((day) => day.date)
    .filter((date) => date < marketDate)
    .slice(-20);

  if (historicalDates.length < 20) {
    return null;
  }

  const currentSessionStart = Math.floor(
    new Date(
      getEasternTimeUtc(
        marketDate,
        Math.floor(session.startMinutes / 60),
        session.startMinutes % 60,
      ),
    ).getTime() / 1000,
  );

  const sessionEnd = Math.floor(
    new Date(
      getEasternTimeUtc(
        marketDate,
        Math.floor(session.endMinutes / 60),
        session.endMinutes % 60,
      ),
    ).getTime() / 1000,
  );

  // Only compare completed 5-minute intervals.
  const elapsedMinutes = Math.min(
    Math.floor((now.getTime() / 1000 - currentSessionStart) / 300) * 5,
    session.endMinutes - session.startMinutes,
  );

  if (elapsedMinutes < 5) {
    return null;
  }

  const getWindow = (date) => {
    const start = new Date(
      getEasternTimeUtc(
        date,
        Math.floor(session.startMinutes / 60),
        session.startMinutes % 60,
      ),
    );

    const end = new Date(start.getTime() + elapsedMinutes * 60 * 1000);

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  };

  const getVolume = async (date) => {
    const window = getWindow(date);

    const url = new URL(
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`,
    );

    url.searchParams.set("timeframe", "5Min");
    url.searchParams.set("start", window.start);
    url.searchParams.set("end", window.end);
    url.searchParams.set("feed", "iex");
    url.searchParams.set("limit", "1000");

    let totalVolume = 0;
    let numberOfBars = 0;

    while (url) {
      const response = await fetchWithRetry(url.toString(), { headers });

      if (!response.ok) {
        throw new Error(
          `Alpaca bars request failed for ${symbol}: ${response.status}`,
        );
      }

      const data = await response.json();

      for (const bar of data.bars || []) {
        const timestamp = new Date(bar.t).getTime();
        if (
          timestamp >= new Date(window.start).getTime() &&
          timestamp < new Date(window.end).getTime()
        ) {
          totalVolume += bar.v;
          numberOfBars++;
        }
      }

      if (!data.next_page_token) {
        break;
      }

      url.searchParams.set("page_token", data.next_page_token);
    }

    return { volume: totalVolume, numberOfBars };
  };

  const historicalVolumes = [];

  console.log("RVOL historical data check:", {
    symbol,
    session: session.session,
    historicalTradingDays: historicalDates.length,
    elapsedMinutes,
  });

  for (const date of historicalDates) {
    const result = await getVolume(date);
    historicalVolumes.push(result.volume);
  }

  console.log("RVOL VOLUME DEBUG:", {
    symbol,
    session: session.session,
    historicalDays: historicalVolumes.length,
    daysWithVolume: historicalVolumes.filter((volume) => volume > 0).length,
    daysWithoutVolume: historicalVolumes.filter((volume) => volume === 0)
      .length,
  });

  const averageHistoricalVolume =
    historicalVolumes.reduce((sum, volume) => sum + volume, 0) /
    historicalVolumes.length;

  if (averageHistoricalVolume <= 0) {
    return null;
  }

  const current = await getVolume(marketDate);

  const rvol = current.volume / averageHistoricalVolume;

  return {
    symbol,
    session: session.session,
    numberOfBars: current.numberOfBars,
    sessionVolume: current.volume,
    averageHistoricalVolume: Math.round(averageHistoricalVolume),
    rvol: Number(rvol.toFixed(2)),
  };
}

app.get("/api/test-intraday-volume/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const today = new Date();

    const calendarStartDate = new Date(today);
    calendarStartDate.setDate(calendarStartDate.getDate() - 35);

    const calendarStart = calendarStartDate.toISOString().split("T")[0];

    const marketDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(today);

    const calendarEnd = marketDate;

    const marketTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(today);

    const first30MinutesComplete = marketTime >= "10:00";

    const todayDate = today.toISOString().split("T")[0];

    const calendarResponse = await fetch(
      `https://paper-api.alpaca.markets/v2/calendar?start=${calendarStart}&end=${calendarEnd}`,
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      },
    );

    const calendarData = await calendarResponse.json();

    const todayMarketDay = calendarData.find((day) => day.date === marketDate);

    const canUseToday = todayMarketDay !== undefined && first30MinutesComplete;

    const tradingDates = calendarData.map((day) => day.date);

    const completedTradingDates = tradingDates.filter((date) => {
      if (date < marketDate) {
        return true;
      }

      if (date === marketDate && canUseToday) {
        return true;
      }

      return false;
    });

    const lastTwentyOneTradingDates = completedTradingDates.slice(-21);

    const testDate = lastTwentyOneTradingDates[20];

    const testMarketWindow = getMarketOpenUtc(testDate);

    const calendarHistoricalDates = lastTwentyOneTradingDates.slice(0, 20);

    const historicalDates = calendarHistoricalDates;

    const historicalVolumes = [];

    function getMarketOpenUtc(date) {
      const noonUtc = new Date(`${date}T12:00:00Z`);

      const timeZoneName = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        timeZoneName: "shortOffset",
      })
        .formatToParts(noonUtc)
        .find((part) => part.type === "timeZoneName").value;

      const offsetHours = Number(timeZoneName.replace("GMT", ""));
      const marketOpenUtcHour = 9 - offsetHours;
      const marketEndUtcHour = marketOpenUtcHour + 1;

      return {
        start: `${date}T${String(marketOpenUtcHour).padStart(2, "0")}:30:00Z`,
        end: `${date}T${String(marketEndUtcHour).padStart(2, "0")}:00:00Z`,
      };
    }

    for (const date of historicalDates) {
      const marketWindow = getMarketOpenUtc(date);

      const historicalResponse = await fetch(
        `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=5Min&start=${marketWindow.start}&end=${marketWindow.end}&feed=iex`,
        {
          headers: {
            "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
          },
        },
      );

      const historicalData = await historicalResponse.json();

      if (!historicalData.bars || historicalData.bars.length === 0) {
        continue;
      }

      const first30Minutes = historicalData.bars.filter((bar) => {
        return bar.t >= marketWindow.start && bar.t < marketWindow.end;
      });

      const first30MinuteVolume = first30Minutes.reduce((total, bar) => {
        return total + bar.v;
      }, 0);

      historicalVolumes.push(first30MinuteVolume);
    }

    const totalHistoricalVolume = historicalVolumes.reduce((total, volume) => {
      return total + volume;
    }, 0);

    const averageHistoricalVolume =
      totalHistoricalVolume / historicalVolumes.length;

    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=5Min&start=${testMarketWindow.start}&end=${testMarketWindow.end}&feed=iex`,
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      },
    );

    const data = await response.json();

    if (!data.bars || data.bars.length === 0) {
      return res.status(404).json({
        error: `No market data found for symbol ${symbol}`,
      });
    }

    const first30Minutes = data.bars.filter((bar) => {
      return bar.t >= testMarketWindow.start && bar.t < testMarketWindow.end;
    });

    const first30MinuteVolume = first30Minutes.reduce((total, bar) => {
      return total + bar.v;
    }, 0);

    const rvol = first30MinuteVolume / averageHistoricalVolume;

    res.json({
      symbol: data.symbol,
      numberOfBars: first30Minutes.length,
      first30MinuteVolume: first30MinuteVolume,
      averageHistoricalVolume: Math.round(averageHistoricalVolume),
      rvol: Number(rvol.toFixed(2)),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to get intraday volume data",
    });
  }
});

app.get("/api/stocks", (req, res) => {
  const stocks = [
    {
      symbol: "ABCD",
      price: 4.25,
      change: 32.5,
      rvol: 7.8,
      float: 12.4,
      hasNews: true,
    },
    {
      symbol: "XYZ",
      price: 8.72,
      change: 105.3,
      rvol: 11.2,
      float: 6.7,
      hasNews: false,
    },
  ];

  res.json(stocks);
});

app.get("/api/test-calendar", async (req, res) => {
  try {
    const response = await fetch(
      "https://paper-api.alpaca.markets/v2/calendar?start=2026-09-25&end=2026-10-05",
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      },
    );

    const data = await response.json();

    const tradingDates = data.map((day) => day.date);

    const completedTradingDates = tradingDates.filter(
      (date) => date <= "2026-10-02",
    );

    const lastFourTradingDates = completedTradingDates.slice(-4);

    const calendarHistoricalDates = lastFourTradingDates.slice(0, 3);

    console.log("Calendar historical dates:", calendarHistoricalDates);

    const historicalDates = lastFourTradingDates.slice(0, 3);

    const testDate = lastFourTradingDates[3];

    res.json(lastFourTradingDates);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to get market calendar",
    });
  }
});

app.get("/api/test-scanner", async (req, res) => {
  try {
    const assetsResponse = await fetchWithRetry(
      "https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity",
      {
        headers: {
          "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
          "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
        },
      },
    );

    if (!assetsResponse.ok) {
      throw new Error(`Alpaca assets request failed: ${assetsResponse.status}`);
    }

    const assetsData = await assetsResponse.json();

    const tradableAssets = assetsData.filter((asset) => {
      return asset.tradable === true;
    });

    const symbols = tradableAssets.map((asset) => {
      return asset.symbol;
    });

    const batchSize = 200;

    const symbolBatches = [];

    for (let i = 0; i < symbols.length; i += batchSize) {
      symbolBatches.push(symbols.slice(i, i + batchSize));
    }

    const allSnapshots = {};

    for (const batch of symbolBatches) {
      const symbolsQuery = batch.join(",");

      const snapshotsResponse = await fetchWithRetry(
        `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbolsQuery}&feed=iex`,
        {
          headers: {
            "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
          },
        },
      );

      if (!snapshotsResponse.ok) {
        throw new Error(
          `Alpaca snapshots request failed: ${snapshotsResponse.status}`,
        );
      }

      const snapshotsData = await snapshotsResponse.json();

      Object.assign(allSnapshots, snapshotsData);
    }

    const stocks = Object.entries(allSnapshots).map(([symbol, snapshot]) => {
      const currentPrice = snapshot.latestTrade?.p;
      const previousClose = snapshot.prevDailyBar?.c;

      return {
        symbol: symbol,
        price: currentPrice,
        previousClose: previousClose,
        change:
          currentPrice && previousClose
            ? Number(
                (
                  ((currentPrice - previousClose) / previousClose) *
                  100
                ).toFixed(2),
              )
            : null,
      };
    });

    const momentumCandidates = stocks.filter((stock) => {
      return stock.price >= 1 && stock.price <= 20 && stock.change >= 20;
    });

    const stocksWithRvol = [];

    for (const stock of momentumCandidates) {
      const symbol = stock.symbol;

      try {
        const rvolData = await calculateRvol(symbol);

        if (rvolData) {
          stocksWithRvol.push({
            ...stock,
            rvol: rvolData.rvol,
          });
        }
      } catch (error) {
        // Log the failure and continue scanning other stocks.
        console.error(`RVOL calculation failed for ${symbol}:`, error);
      }
    }

    const highRvolStocks = stocksWithRvol.filter((stock) => {
      return stock.rvol > 5;
    });

    console.log("SCANNER DEBUG:", {
      totalSnapshots: Object.keys(allSnapshots).length,
      momentumCandidates: momentumCandidates.length,
      stocksWithRvol: stocksWithRvol.length,
      highRvolStocks: highRvolStocks.length,
    });

    const stocksWithFloat = [];

    for (const stock of highRvolStocks) {
      try {
        const floatData = await getFloat(stock.symbol);

        if (floatData) {
          stocksWithFloat.push({
            ...stock,
            float: floatData.float,
            floatMillions: floatData.floatMillions,
          });
        }
      } catch (error) {
        // Log the failure and continue scanning other stocks.
        console.error(`Float request failed for ${stock.symbol}:`, error);
      }
    }

    const lowFloatStocks = stocksWithFloat.filter((stock) => {
      return stock.float < 20_000_000;
    });

    const stocksWithNews = [];

    for (const stock of lowFloatStocks) {
      const newsData = await getNews(stock.symbol);

      if (newsData) {
        stocksWithNews.push({
          ...stock,
          hasNews: newsData.hasNews,
          isFreshNews: newsData.isFresh,
          newsAgeInHours: newsData.ageInHours,
          headline: newsData.headline,
          newsSource: newsData.source,
          newsUrl: newsData.url,
        });
      }
    }

    const stocksWithFreshNews = stocksWithNews.filter((stock) => {
      return stock.hasNews && stock.isFreshNews;
    });

    res.json(stocksWithFreshNews);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to run stock scanner",
    });
  }
});

app.get("/api/test-float/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    const floatData = await getFloat(symbol);

    res.json(floatData);
  } catch (error) {
    console.error("Float test error:", error);
    res.status(500).json({ error: "Failed to fetch float data" });
  }
});

app.get("/api/test-rvol/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const result = await calculateRvol(symbol);

    if (!result) {
      return res.json({
        symbol,
        message: "RVOL data unavailable for the current session.",
      });
    }

    res.json(result);
  } catch (error) {
    console.error("RVOL test error:", error.message);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/test-news/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  try {
    const newsData = await getNews(symbol);

    res.json(newsData);
  } catch (error) {
    console.error("News test error:", error);

    res.status(500).json({
      error: "Failed to fetch stock news",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
