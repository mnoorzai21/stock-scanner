import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useScanner } from "./useScanner";
import { playAlertSound, showNotification, unlockAlerts } from "./lib/alerts";
import {
  SESSION_LABELS,
  formatAge,
  formatCompact,
  formatNextOpen,
  formatTime,
} from "./lib/format";

const DEFAULT_CRITERIA = {
  minPrice: 1,
  maxPrice: 20,
  minChangePercent: 20,
  minRvol: 5,
  maxFloat: 20_000_000,
};

function CriteriaChips({ criteria }) {
  return (
    <div className="chips" aria-label="Scanner criteria">
      <span>
        Price <strong>${criteria.minPrice}–${criteria.maxPrice}</strong>
      </span>
      <span>
        Gain <strong>{criteria.minChangePercent}%+</strong>
      </span>
      <span>
        RVOL <strong>&gt;{criteria.minRvol}x</strong>
      </span>
      <span>
        Float <strong>&lt;{formatCompact(criteria.maxFloat)}</strong>
      </span>
      <span>
        News <strong>Required</strong>
      </span>
    </div>
  );
}

function Funnel({ stats }) {
  if (!stats || stats.symbolsScanned === undefined) {
    return null;
  }

  const steps = [
    ["traded today", stats.tradedToday],
    ["price & gain", stats.priceAndGain],
    ["RVOL", stats.rvol],
    ["float", stats.float],
    ["news", stats.news],
  ].filter(([, count]) => count !== undefined);

  const rvolNotes = [
    stats.rvolNoHistory > 0 &&
      `${stats.rvolNoHistory.toLocaleString()} passed RVOL with no volume history (shown as "New")`,
    stats.missingRvolHistory > 0 &&
      `${stats.missingRvolHistory.toLocaleString()} skipped: no volume history and too little volume today`,
    stats.floatFlagged > 0 &&
      `${stats.floatFlagged.toLocaleString()} shown with unverified float data (marked ⚠)`,
  ].filter(Boolean);

  return (
    <>
      <ol className="funnel" aria-label="How many stocks passed each filter">
        {steps.map(([label, count]) => (
          <li key={label}>
            <strong>{count.toLocaleString()}</strong> {label}
          </li>
        ))}
      </ol>
      {rvolNotes.length > 0 && (
        <p className="funnel-note muted">{rvolNotes.join(" · ")}</p>
      )}
    </>
  );
}

function RvolCell({ stock }) {
  if (stock.noHistory) {
    return (
      <span title="No volume on this data feed in the past 20 days. Heavy volume today.">
        New
      </span>
    );
  }

  if (stock.basis === "session") {
    return (
      <span title="No volume in this time window on past days. Compared with their full-session average.">
        {stock.rvol.toFixed(1)}x*
      </span>
    );
  }

  return `${stock.rvol.toFixed(1)}x`;
}

function FloatCell({ stock }) {
  const float = `${stock.floatMillions.toFixed(1)}M`;
  const warnings = stock.floatWarnings ?? [];

  if (warnings.length === 0) {
    return float;
  }

  return (
    <span
      className="float-flag"
      title={`Float unverified: ${warnings.join(". ")}. Check the float on your broker before trading.`}>
      {float} ⚠
    </span>
  );
}

function ResultsTable({ stocks }) {
  return (
    <div className="stock-table">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Change</th>
            <th>RVOL</th>
            <th>Volume</th>
            <th>Float</th>
            <th>News</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr
              key={stock.symbol}
              className={stock.change >= 30 ? "big-mover" : ""}>
              <td data-label="Symbol">
                <a
                  className="symbol"
                  href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(stock.symbol)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open chart">
                  {stock.symbol}
                </a>
              </td>
              <td data-label="Price">${stock.price.toFixed(2)}</td>
              <td data-label="Change" className="gain">
                +{stock.change.toFixed(1)}%
              </td>
              <td data-label="RVOL">
                <RvolCell stock={stock} />
              </td>
              <td data-label="Volume">{formatCompact(stock.sessionVolume)}</td>
              <td data-label="Float">
                <FloatCell stock={stock} />
              </td>
              <td data-label="News" className="news">
                <a
                  href={stock.newsUrl}
                  target="_blank"
                  rel="noopener noreferrer">
                  {stock.headline}
                </a>
                <span className="muted">
                  {[stock.newsSource, formatAge(stock.newsAgeInHours)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const { state, loading, connectionError, scanNow } = useScanner();
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertNote, setAlertNote] = useState("");
  const alertedKeys = useRef(new Set());

  const lastScan = state?.lastScan;
  const results = lastScan?.results;
  const scanning = Boolean(state?.scanning);
  const criteria = lastScan?.criteria || DEFAULT_CRITERIA;
  const sessionKey = lastScan?.session || "closed";
  const nextOpen = sessionKey === "closed" ? formatNextOpen(lastScan?.nextOpen) : "";

  // Alert once per stock per level per day.
  useEffect(() => {
    if (!alertsEnabled || !results) {
      return;
    }

    const day = lastScan.startedAt.slice(0, 10);

    for (const stock of results) {
      const level = stock.change >= 30 ? 30 : 20;
      const key = `${day}:${stock.symbol}:${level}`;

      if (!alertedKeys.current.has(key)) {
        alertedKeys.current.add(key);
        alertedKeys.current.add(`${day}:${stock.symbol}:20`);
        playAlertSound(level);
        showNotification(stock);
      }
    }
  }, [alertsEnabled, results, lastScan]);

  const toggleAlerts = async () => {
    if (alertsEnabled) {
      setAlertsEnabled(false);
      setAlertNote("");
      return;
    }

    try {
      const { sound, notifications } = await unlockAlerts();
      setAlertsEnabled(true);
      playAlertSound(20);
      setAlertNote(
        [
          sound ? "Sound on" : "Sound blocked by the browser",
          notifications
            ? "desktop notifications on"
            : "desktop notifications off",
        ].join(", ") + ". Keep this tab open.",
      );
    } catch (error) {
      console.error(error);
      setAlertNote("Your browser blocked alerts.");
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Stock Scanner</h1>
          <p>Real-time momentum scanner for U.S. stocks</p>
        </div>
        {lastScan && (
          <span className={`session session-${sessionKey}`} role="status">
            {SESSION_LABELS[sessionKey]}
            {nextOpen && <span className="session-next">Opens {nextOpen}</span>}
          </span>
        )}
      </header>

      <main>
        <section className="scanner">
          <div className="toolbar">
            <div>
              <h2>Scanner Results</h2>
              <p className="muted">
                {lastScan
                  ? `Last scan ${formatTime(lastScan.finishedAt)} · ${(lastScan.durationMs / 1000).toFixed(1)}s · ${lastScan.feed.toUpperCase()} feed`
                  : "Waiting for the first scan…"}
              </p>
            </div>
            <div className="buttons">
              <button type="button" onClick={scanNow} disabled={scanning}>
                {scanning ? "Scanning…" : "Scan Now"}
              </button>
              <button
                type="button"
                className={alertsEnabled ? "active" : ""}
                aria-pressed={alertsEnabled}
                onClick={toggleAlerts}>
                {alertsEnabled ? "🔔 Alerts On" : "Enable Alerts"}
              </button>
            </div>
          </div>

          {alertNote && <p className="note">{alertNote}</p>}

          <CriteriaChips criteria={criteria} />
          <Funnel stats={lastScan?.stats} />

          {connectionError && <p className="banner error">{connectionError}</p>}
          {state?.lastError && (
            <p className="banner error">
              Last scan failed: {state.lastError.message}
            </p>
          )}
          {lastScan?.warnings?.map((warning) => (
            <p key={warning} className="banner warning">
              {warning}
            </p>
          ))}

          {loading ? (
            <p className="empty">Connecting to scanner…</p>
          ) : lastScan?.message ? (
            <p className="empty">{lastScan.message}</p>
          ) : results?.length ? (
            <ResultsTable stocks={results} />
          ) : (
            lastScan && (
              <p className="empty">No stocks match all five criteria right now.</p>
            )
          )}

          {lastScan?.feed === "iex" && (
            <p className="footnote">
              Using Alpaca's free IEX feed, which covers one exchange. Prices
              and volume on thinly traded small caps can lag the full market.
              Always confirm on your broker's chart before trading.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
