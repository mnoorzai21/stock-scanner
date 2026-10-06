import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [stocks, setStocks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const SCAN_INTERVAL = 120000;

  useEffect(() => {
    let timeoutId;
    let isActive = true;
    const runScanner = () => {
      fetch("http://localhost:3000/api/test-scanner")
        .then((response) => response.json())
        .then((data) => {
          console.log("Scanner data: ", data);
          if (!isActive) return;
          setStocks(data);
          setLoading(false);
          setError("");
          timeoutId = setTimeout(runScanner, SCAN_INTERVAL);
        })
        .catch((error) => {
          console.error("Scanner error:", error);

          if (!isActive) return;
          setLoading(false);
          setError("Unable to connect to the stock scanner.");
          timeoutId = setTimeout(runScanner, SCAN_INTERVAL);
        });
    };

    runScanner();
    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, []);

  const alertedStocks = useRef(new Set());

  const playAlertSound = () => {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();

    oscillator.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  const filteredStocks = stocks.filter((stock) => {
    return (
      stock.price >= 2 &&
      stock.price <= 20 &&
      stock.change >= 20 &&
      stock.rvol > 5 &&
      stock.float < 20_000_000 &&
      stock.hasNews
    );
  });

  useEffect(() => {
    if (!alertsEnabled) {
      return;
    }

    filteredStocks.forEach((stock) => {
      if (stock.change >= 30 && !alertedStocks.current.has(stock.symbol)) {
        playAlertSound();
        alertedStocks.current.add(stock.symbol);
      }
    });
  }, [alertsEnabled, filteredStocks]);

  return (
    <div className="app">
      <header className="header">
        <h1>Stock Scanner</h1>
        <p>Real-Time Momentum Scanner</p>
      </header>

      <main>
        <section className="scanner">
          <h2>Scanner Results</h2>
          <button
            className="alert-button"
            onClick={() => {
              setAlertsEnabled(!alertsEnabled);
            }}>
            {alertsEnabled ? "🔔 Alerts Enabled" : "Enable Alerts"}
          </button>

          <div className="scanner-filters">
            <span>
              Price: <strong>$2–$20</strong>
            </span>
            <span>
              Gain: <strong>20%+</strong>
            </span>
            <span>
              RVOL: <strong>5x+</strong>
            </span>
            <span>
              Float: <strong>Under 20M</strong>
            </span>
            <span>
              News: <strong>Required</strong>
            </span>
          </div>

          <div className="stock-table">
            {loading && <p>Scanning market...</p>}
            {error && <p>{error}</p>}
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>RVOL</th>
                  <th>Float</th>
                  <th>News</th>
                </tr>
              </thead>

              <tbody>
                {filteredStocks.map((stock) => (
                  <tr
                    key={stock.symbol}
                    className={stock.change >= 30 ? "big-mover" : ""}>
                    <td>{stock.symbol}</td>
                    <td>${stock.price.toFixed(2)}</td>
                    <td>+{stock.change}%</td>
                    <td>{stock.rvol}</td>
                    <td>{stock.floatMillions}M</td>
                    <td>
                      <a
                        href={stock.newsUrl}
                        target="_blank"
                        rel="noopener noreferrer">
                        {stock.headline}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
