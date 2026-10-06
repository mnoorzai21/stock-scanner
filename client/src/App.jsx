import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [stocks, setStocks] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:3000/api/test-scanner")
      .then((response) => response.json())
      .then((data) => {
        console.log("Scanner data: ", data);
        setStocks(data);
        setLoading(false);
      });
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
              setAlertsEnabled(true);
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
                    className={stock.change >= 100 ? "big-mover" : ""}>
                    <td>{stock.symbol}</td>
                    <td>${stock.price.toFixed(2)}</td>
                    <td>+{stock.change}%</td>
                    <td>{stock.rvol}</td>
                    <td>{stock.floatMillions}M</td>
                    <td>{stock.headline}</td>
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
