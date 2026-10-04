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

app.get("/api/test-intraday-volume", async (req, res) => {
  try {
    const historicalDates = ["2026-09-29", "2026-09-30", "2026-10-01"];

    const historicalVolumes = [];
    for (const date of historicalDates) {
      const historicalResponse = await fetch(
        `https://data.alpaca.markets/v2/stocks/AAPL/bars?timeframe=5Min&start=${date}T13:30:00Z&end=${date}T14:00:00Z&feed=iex`,
        {
          headers: {
            "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
          },
        },
      );

      const historicalData = await historicalResponse.json();

      console.log(date, historicalData.bars.length);
    }

    const response = await fetch(
      "https://data.alpaca.markets/v2/stocks/AAPL/bars?timeframe=5Min&start=2026-10-01T13:30:00Z&end=2026-10-01T14:00:00Z&feed=iex",
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

    res.json({
      symbol: data.symbol,
      numberOfBars: first30Minutes.length,
      first30MinuteVolume: first30MinuteVolume,
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
