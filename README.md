# Stock Scanner — Real-Time Momentum Scanner

A full-stack stock momentum scanner built with **React, Vite, Node.js, and Express**. The application scans U.S. stocks for momentum opportunities using market data, trading volume, share float, and recent news.

## Features

- **Momentum Scanner:** Identifies stocks meeting five trading criteria.
- **Market Data Integration:** Retrieves stock information using the Alpaca API.
- **Relative Volume (RVOL):** Measures trading activity against historical volume.
- **Float Filtering:** Uses SentiSense data to identify lower-float stocks.
- **News Verification:** Requires recent news before a stock qualifies.
- **Automatic Scanning:** Refreshes scanner results approximately every two minutes.
- **Manual Scanning:** Includes a Scan Now button.
- **Sound Alerts:** Plays different alerts when qualifying stocks reach 20% and 30% gains.
- **Responsive Interface:** Dark-themed dashboard built with React.

## Stock Selection Criteria

A stock must meet all five conditions:

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
- Alpaca — stock market data and news
- SentiSense — share float information

**Developer Tools**
- Git and GitHub
- Visual Studio Code
- npm

## How It Works

1. The React frontend requests scanner results from the Express backend.
2. The backend retrieves stock market data from Alpaca.
3. Stocks are evaluated against the momentum criteria.
4. Additional volume, float, and news checks narrow the results.
5. Qualified stocks appear in the dashboard.
6. When alerts are enabled, qualifying stocks trigger distinct sounds at the 20% and 30% gain thresholds.

## Getting Started

### Environment Variables

Create a `.env` file inside the `server` folder:

```env
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
SENTISENSE_API_KEY=your_sentisense_api_key

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

Configure the required API credentials using environment variables on the backend. Keep your API keys private and never commit your `.env` file.

### Run the Application

Start the backend from the `server` directory:

```bash
node server.js
```

In a separate terminal, start the frontend from the `client` directory:

```bash
npm run dev
```

Open the local URL provided by Vite, usually:

`http://localhost:5173`

The frontend expects the backend to run at:

`http://localhost:3000`

## Current Limitations

- Market data availability and timeliness depend on the API provider and subscription.
- Stocks that do not meet every filter are excluded.
- Browser sound alerts require audio permission or user interaction.
- The application is designed for momentum research and does not execute trades.
- This version uses a locally configured backend URL.

## Future Improvements

- Mobile notifications
- Historical scanner results
- Additional filter customization
- More extensive automated testing

## Disclaimer

This project is for educational and informational purposes only. It is not financial advice or a recommendation to buy or sell securities. Trading stocks involves substantial financial risk.

## Author

**Mohammad Nabi Noorzai**

GitHub: [mnoorzai21](https://github.com/mnoorzai21)