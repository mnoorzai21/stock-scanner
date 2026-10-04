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
