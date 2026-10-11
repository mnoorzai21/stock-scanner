import { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [stocks, setStocks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const SCAN_INTERVAL = 120000;
  const timeoutRef = useRef(null);
  const isActiveRef = useRef(true);
  const isScanningRef = useRef(false);

  const runScanner = () => {
    if (isScanningRef.current) return;
    clearTimeout(timeoutRef.current);
    isScanningRef.current = true;
    fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/test-scanner`,
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Scanner request failed: ${response.status}`);
        }

        return response.json();
      })
      .then((data) => {
        console.log("Scanner data: ", data);
        if (!Array.isArray(data)) {
          throw new Error("Invalid scanner data received");
        }
        isScanningRef.current = false;
        if (!isActiveRef.current) return;
        setStocks(data);
        setLoading(false);
        setError("");
        setLastUpdated(new Date());
        timeoutRef.current = setTimeout(runScanner, SCAN_INTERVAL);
      })
      .catch((error) => {
        console.error("Scanner error:", error);
        isScanningRef.current = false;
        if (!isActiveRef.current) return;
        setLoading(false);
        setError("Unable to connect to the stock scanner.");
        timeoutRef.current = setTimeout(runScanner, SCAN_INTERVAL);
      });
  };

  useEffect(() => {
    isActiveRef.current = true;
    runScanner();
    return () => {
      isActiveRef.current = false;
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const alertedStocks = useRef(new Set());

  const playAlertSound = (level) => {
    const audioContext = new AudioContext();

    const playBeep = (frequency, startTime, duration) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.frequency.value = frequency;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.6, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioContext.currentTime;

    if (level === 20) {
      // One short beep for stocks gaining at least 20%.
      playBeep(600, now, 0.2);
    } else if (level === 30) {
      // Two higher-pitched beeps for stocks gaining at least 30%.
      playBeep(1000, now, 0.2);
      playBeep(1000, now + 0.3, 0.2);
    }
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
      const alertedLevels = alertedStocks.current;

      if (stock.change >= 30) {
        const alertKey = `${stock.symbol}-30`;

        if (!alertedLevels.has(alertKey)) {
          playAlertSound(30);
          alertedLevels.add(alertKey);
          alertedLevels.add(`${stock.symbol}-20`);
        }
      } else if (stock.change >= 20) {
        const alertKey = `${stock.symbol}-20`;

        if (!alertedLevels.has(alertKey)) {
          playAlertSound(20);
          alertedLevels.add(alertKey);
        }
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
          {lastUpdated && (
            <p>Last updated: {lastUpdated.toLocaleTimeString()}</p>
          )}
          <button className="alert-button" onClick={runScanner}>
            Scan Now
          </button>
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
                {!loading && !error && filteredStocks.length === 0 && (
                  <tr>
                    <td colSpan="6">
                      No stocks currently match all scanner criteria.
                    </td>
                  </tr>
                )}
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
