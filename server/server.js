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

app.get("/api/test-intraday-volume/:symbol", async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const today = new Date();

    const marketDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(today);

    console.log("Market date:", marketDate);

    const marketTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(today);

    console.log("Market time:", marketTime);

    const first30MinutesComplete = marketTime >= "10:00";

    console.log("First 30 minutes complete:", first30MinutesComplete);

    const todayDate = today.toISOString().split("T")[0];

    const calendarResponse = await fetch(
      "https://paper-api.alpaca.markets/v2/calendar?start=2026-09-25&end=2026-10-05",
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

    console.log("Can use today:", canUseToday);

    console.log("Today market day:", todayMarketDay);

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

    const lastFourTradingDates = completedTradingDates.slice(-4);

    const testDate = lastFourTradingDates[3];

    const testMarketWindow = getMarketOpenUtc(testDate);

    console.log("Test market window:", testMarketWindow);

    const calendarHistoricalDates = lastFourTradingDates.slice(0, 3);

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

      console.log(
        "Offset:",
        offsetHours,
        "UTC open hour:",
        marketOpenUtcHour,
        "UTC end hour:",
        marketEndUtcHour,
      );

      return {
        start: `${date}T${String(marketOpenUtcHour).padStart(2, "0")}:30:00Z`,
        end: `${date}T${String(marketEndUtcHour).padStart(2, "0")}:00:00Z`,
      };
    }

    for (const date of historicalDates) {
      const marketWindow = getMarketOpenUtc(date);
      console.log("Market window:", marketWindow);

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

      console.log("Historical response:", historicalData);

      const first30Minutes = historicalData.bars.slice(0, 6);

      const first30MinuteVolume = first30Minutes.reduce((total, bar) => {
        return total + bar.v;
      }, 0);

      historicalVolumes.push(first30MinuteVolume);

      console.log(date, first30MinuteVolume);
    }

    const totalHistoricalVolume = historicalVolumes.reduce((total, volume) => {
      return total + volume;
    }, 0);

    const averageHistoricalVolume =
      totalHistoricalVolume / historicalVolumes.length;

    console.log("Average:", Math.round(averageHistoricalVolume));

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

    const first30Minutes = data.bars.slice(0, 6);

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
