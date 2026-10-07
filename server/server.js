require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());

const PORT = 3000;

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
  const response = await fetch(
    `https://data.alpaca.markets/v1beta1/news?symbols=${symbol}&limit=5`,
    {
      headers: {
        "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (!data.news || data.news.length === 0) {
    return {
      hasNews: false,
    };
  }

  const latestNews = data.news[0];

  const newsTime = new Date(latestNews.created_at);
  const now = new Date();

  const ageInHours = (now - newsTime) / (1000 * 60 * 60);
  const isFresh = ageInHours <= 24;

  return {
    hasNews: true,
    isFresh: isFresh,
    ageInHours: Number(ageInHours.toFixed(2)),
    headline: latestNews.headline,
    createdAt: latestNews.created_at,
    source: latestNews.source,
    url: latestNews.url,
  };
}

async function getFloat(symbol) {
  const response = await fetch(
    `https://app.sentisense.ai/api/v1/stocks/float?ticker=${symbol}`,
    {
      headers: {
        "X-SentiSense-API-Key": process.env.SENTISENSE_API_KEY,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();

  if (data.freeFloat == null) {
    return null;
  }

  return {
    symbol: data.ticker,
    float: data.freeFloat,
    floatMillions: Number((data.freeFloat / 1_000_000).toFixed(2)),
  };
}

async function calculateRvol(symbol) {
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

  const calendarResponse = await fetch(
    `https://paper-api.alpaca.markets/v2/calendar?start=${calendarStart}&end=${calendarEnd}`,
    {
      headers: {
        "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
      },
    },
  );

  if (!calendarResponse.ok) {
    throw new Error(
      `Alpaca calendar request failed: ${calendarResponse.status}`,
    );
  }

  const calendarData = await calendarResponse.json();

  const tradingDates = calendarData.map((day) => {
    return day.date;
  });

  const todayMarketDay = calendarData.find((day) => {
    return day.date === marketDate;
  });

  const canUseToday = todayMarketDay !== undefined && first30MinutesComplete;

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

  const historicalDates = lastTwentyOneTradingDates.slice(0, 20);

  const historicalVolumes = [];

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

  if (historicalVolumes.length === 0) {
    return null;
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
    return null;
  }

  const first30Minutes = data.bars.filter((bar) => {
    return bar.t >= testMarketWindow.start && bar.t < testMarketWindow.end;
  });

  const first30MinuteVolume = first30Minutes.reduce((total, bar) => {
    return total + bar.v;
  }, 0);

  const rvol = first30MinuteVolume / averageHistoricalVolume;

  return {
    symbol,
    numberOfBars: first30Minutes.length,
    first30MinuteVolume,
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
    const assetsResponse = await fetch(
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

      const snapshotsResponse = await fetch(
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
      return stock.price >= 2 && stock.price <= 20 && stock.change >= 20;
    });

    const stocksWithRvol = [];

    for (const stock of momentumCandidates) {
      const symbol = stock.symbol;

      const rvolData = await calculateRvol(symbol);

      if (rvolData) {
        stocksWithRvol.push({
          ...stock,
          rvol: rvolData.rvol,
        });
      }
    }

    const highRvolStocks = stocksWithRvol.filter((stock) => {
      return stock.rvol > 5;
    });

    const stocksWithFloat = [];

    for (const stock of highRvolStocks) {
      const floatData = await getFloat(stock.symbol);

      if (floatData) {
        stocksWithFloat.push({
          ...stock,
          float: floatData.float,
          floatMillions: floatData.floatMillions,
        });
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
