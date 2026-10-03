const express = require("express");

const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.send("Stock Scanner API is running");
});

app.get("/", (req, res) => {
  res.send("Stock Scanner API is running");
  app.get("/api/stocks", (req, res) => {
    const stocks = [
      {
        symbol: "ABCD",
        price: 4.25,
        change: 32.5,
        rvol: 7.8,
        float: 12.4,
      },
      {
        symbol: "XYZ",
        price: 8.72,
        change: 105.3,
        rvol: 11.2,
        float: 6.7,
      },
    ];

    res.json(stocks);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
