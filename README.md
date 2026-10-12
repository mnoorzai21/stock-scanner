# Stock Scanner — Real-Time Momentum Scanner

A full-stack stock momentum scanner built with **React, Vite, Node.js, and Express**. The application scans U.S. stocks for momentum opportunities using market data, trading volume, share float, and recent news.

**[Live Demo](https://mnoorzai21.github.io/stock-scanner/)**

## Features

- **Momentum Scanner:** Screens stocks against five trading criteria.
- **Market Data Integration:** Retrieves U.S. stock information using the Alpaca API.
- **Relative Volume (RVOL):** Evaluates trading activity against historical volume.
- **Float Filtering:** Uses SentiSense data to identify lower-float stocks.
- **News Verification:** Requires recent news before a stock qualifies.
- **Automatic Scanning:** Refreshes results approximately every two minutes while the application is running.
- **Manual Scanning:** Includes a Scan Now button.
- **Sound Alerts:** Plays different alerts for qualifying stocks reaching 20% and 30% gains.
- **Responsive Dashboard:** Dark-themed React interface.

## Stock Selection Criteria

A stock must meet **all five conditions** to appear in the results.

| Filter | Requirement |
|---|---|
| Price | $2–$20 |
| Price Change | At least +20% |
| Relative Volume | Greater than 5x |
| Share Float | Below 20 million shares |
| News | Recent news required |

## Technology Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS

**Backend**
- Node.js
- Express
- REST API

**External APIs**
- Alpaca — market data and news
- SentiSense — share float information

**Deployment and Developer Tools**
- GitHub Pages — frontend hosting
- Render — backend hosting
- GitHub Actions — automated frontend deployment
- Git and GitHub
- Visual Studio Code
- npm

## How It Works

1. The React frontend requests scanner results from the Express backend.
2. The backend retrieves market data from Alpaca.
3. Stocks are evaluated against the price and momentum criteria.
4. Volume, float, and news checks further filter the results.
5. Qualified stocks appear in the dashboard.
6. When sound alerts are enabled, qualifying stocks can trigger distinct sounds at the 20% and 30% thresholds.

## Live Deployment

**Frontend:** https://mnoorzai21.github.io/stock-scanner/

**Backend:** Node.js and Express hosted on Render.

The frontend is deployed to GitHub Pages using GitHub Actions.
The backend is deployed separately on Render.

**Hosting note:** The backend uses Render's free service, which may sleep during inactivity. The first request after an idle period may take longer to complete.

## Getting Started

### Prerequisites

- Node.js and npm
- Alpaca API credentials
- SentiSense API credentials

### Installation

Clone the repository:

```bash
git clone https://github.com/mnoorzai21/stock-scanner.git
cd stock-scanner
```

Install frontend dependencies:

```bash
cd client
npm install
```

Install backend dependencies:

```bash
cd ../server
npm install
```

### Environment Variables

Create a `.env` file inside the `server` directory:

```env
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
SENTISENSE_API_KEY=your_sentisense_api_key
```

Keep your API credentials private. Never commit the backend `.env` file.

### Run Locally

Start the backend from the `server` directory:

```bash
node server.js
```

In a separate terminal, start the frontend from the `client` directory:

```bash
npm run dev
```

Open the local URL provided by Vite, usually:

http://localhost:5173

The frontend connects to the local backend at:

http://localhost:3000

## Current Limitations

- Market data availability, coverage, and timeliness depend on API providers and subscriptions.
- Stocks that do not meet every filter are excluded.
- Browser sound alerts require user interaction and may be affected by browser restrictions.
- Alerts operate while the web application is running; they are not server-side push notifications.
- The Render free service may introduce delays after inactivity.
- The application is designed for momentum research and does not execute trades.

## Future Improvements

- Mobile notifications
- Historical scanner results
- Customizable scanner filters
- More extensive automated testing
- Improved market data coverage and monitoring

## Disclaimer

This project is for educational and informational purposes only. It is not financial advice or a recommendation to buy or sell securities. Trading stocks involves substantial financial risk.

## Author

**Mohammad Nabi Noorzai**

GitHub: https://github.com/mnoorzai21