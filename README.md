# Stock Scanner — Real-Time Momentum Scanner

[![CI](https://github.com/mnoorzai21/stock-scanner/actions/workflows/ci.yml/badge.svg)](https://github.com/mnoorzai21/stock-scanner/actions/workflows/ci.yml)

A full-stack momentum scanner for U.S. stocks built with **React, Vite, Node.js and Express**. It scans every tradable U.S. stock during premarket, regular and after-hours sessions and surfaces low-float stocks making big moves on heavy volume with a fresh news catalyst.

**[Live Demo](https://mnoorzai21.github.io/stock-scanner/)**

## Features

- **Five-filter momentum scan** of roughly 10,000 U.S. stocks, run in the background every minute while the dashboard is open.
- **Session-aware relative volume (RVOL):** compares volume so far in the current session with the same time window on each of the previous 20 trading days.
- **Correct premarket % change:** measured against the previous session's close, even before the day's first regular-hours bar exists.
- **Float filter** using Massive (formerly Polygon.io), with batched lookups and a 24-hour cache to stay within free-plan rate limits.
- **News verification:** requires a news article from the last 24 hours that is actually about the stock. Market roundups that only tag it, and "why is it moving" articles, are ignored.
- **Sound and desktop alerts** at +20% (one beep) and +30% (two beeps), once per stock per day.
- **Scan funnel** showing how many stocks passed each filter, so an empty result list is easy to understand.
- **Responsive dark dashboard** with a card layout on phones and one-click chart links.

## Stock Selection Criteria

A stock must meet **all five conditions** to appear. Each threshold can be changed with an environment variable.

| Filter          | Default requirement      | Variable             |
| --------------- | ------------------------ | -------------------- |
| Price           | $1–$20                   | `MIN_PRICE`, `MAX_PRICE` |
| Price change    | At least +20%            | `MIN_CHANGE_PERCENT` |
| Relative volume | Greater than 5x          | `MIN_RVOL`           |
| Share float     | Below 20 million shares  | `MAX_FLOAT`          |
| News            | Article in the last 24 hours | `NEWS_MAX_AGE_HOURS` |

## How It Works

```
React dashboard ──polls every 15s──▶ Express API ──▶ cached scan result
                                        │
                     background scan every 60s (while someone is watching)
                                        │
      1. Alpaca assets + snapshots  →  price and % change for every stock
      2. Alpaca 5-minute bars       →  RVOL for the candidates (one batched request)
      3. Massive float              →  share float (batched, cached for a day)
      4. Alpaca news                →  fresh, non-generic catalyst
```

The server runs one scan at a time and caches the result, so any number of open browser tabs share it instead of each triggering its own scan. Scanning pauses automatically after 10 minutes with no dashboard open, which avoids wasting API quota.

## Technology Stack

**Frontend:** React 19, Vite, JavaScript, CSS
**Backend:** Node.js, Express 5, REST API, Node's built-in test runner
**External APIs:** Alpaca (market data, news, trading calendar), Massive (share float)
**Deployment:** GitHub Pages (frontend, via GitHub Actions), Render (backend)

## Getting Started

### Prerequisites

- Node.js 20 or newer
- A free [Alpaca](https://alpaca.markets) account (API key and secret)
- A free [Massive](https://massive.com) account (API key)

### Installation

```bash
git clone https://github.com/mnoorzai21/stock-scanner.git
cd stock-scanner

cd server && npm install
cd ../client && npm install
```

### Environment Variables

Copy the example file inside `server` and add your keys:

```bash
cd server
cp .env.example .env
```

```env
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
MASSIVE_API_KEY=your_massive_api_key
```

`.env.example` also lists optional settings such as the filter thresholds, scan interval and market data feed. Never commit your `.env` file.

### Run Locally

Start the backend:

```bash
cd server
npm run dev
```

In a second terminal, start the frontend:

```bash
cd client
npm run dev
```

Open http://localhost:5173. The frontend talks to the backend at http://localhost:3000 unless `VITE_API_URL` is set.

### Run Tests

```bash
cd server
npm test
```

The tests cover market-hours and daylight-saving logic, RVOL windows, premarket % change, news filtering, retries and rate limits, API batching and caching, and a full scan against a simulated market. CI runs them, plus the frontend lint and build, on every push and pull request.

## API

| Method | Endpoint                    | Description                                   |
| ------ | --------------------------- | --------------------------------------------- |
| GET    | `/api/scanner`              | Latest cached scan, filter funnel and status  |
| POST   | `/api/scan`                 | Request a scan now (limited to one per 15s)   |
| GET    | `/api/health`               | Which API keys are configured, feed, session  |
| GET    | `/api/test-scanner`         | Run a scan and return only the results        |
| GET    | `/api/test-rvol/:symbol`    | RVOL for one symbol                           |
| GET    | `/api/test-float/:symbol`   | Float for one symbol                          |
| GET    | `/api/test-news/:symbol`    | Latest qualifying news for one symbol         |

## Live Deployment

**Frontend:** https://mnoorzai21.github.io/stock-scanner/ (deployed by GitHub Actions on every push to `main`)

**Backend:** Render. Set `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` and `MASSIVE_API_KEY` in the Render dashboard and use `npm start` as the start command from the `server` directory. Render's free plan sleeps when idle, so the first request after a break can take about a minute.

## Using It for Live Trading

- **Market data feed:** Alpaca's free plan provides the **IEX** feed, which covers a single exchange. Prices and volume for thinly traded small caps can lag the full market, and some stocks may be missed. For full-market data, subscribe to Alpaca's SIP feed and set `ALPACA_FEED=sip`.
- **Alerts** run in the browser, so keep the dashboard tab open. Click **Enable Alerts** once per visit so the browser allows sound.
- Always confirm a setup on your broker's chart before trading.

## Future Improvements

- Mobile push notifications
- Historical scanner results
- Filter settings editable from the dashboard
- Streaming quotes via Alpaca's WebSocket API

## Disclaimer

This project is for educational and informational purposes only. It is not financial advice or a recommendation to buy or sell securities. Trading stocks involves substantial financial risk.

## Author

**Mohammad Nabi Noorzai**

GitHub: https://github.com/mnoorzai21
