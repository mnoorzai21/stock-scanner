import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [stocks, setStocks] = useState([]);

  useEffect(() => {
    fetch("http://localhost:3000/api/stocks")
      .then((response) => response.json())
      .then((data) => {
        setStocks(data);
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
      stock.float < 20
    );
  });

  useEffect(() => {
    if (!alertsEnabled) {
      return;
    }

    filteredStocks.forEach((stock) => {
      if (stock.change >= 100 && !alertedStocks.current.has(stock.symbol)) {
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
            onClick={() => {
              setAlertsEnabled(true);
            }}>
            {alertsEnabled ? "🔔 Alerts Enabled" : "Enable Alerts"}
          </button>

          <p>Stocks: $2 - $20 | Gain: 20%+ | RVOL: 5+ | Float: Under 20M</p>

          <div className="stock-table">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>RVOL</th>
                  <th>Float</th>
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
                    <td>{stock.float}M</td>
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
