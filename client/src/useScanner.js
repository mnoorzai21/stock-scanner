import { useCallback, useEffect, useState } from "react";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const POLL_MS = 15_000;
const POLL_WHILE_SCANNING_MS = 3_000;

// Polls the backend's cached scan results. The server does the scanning on
// its own schedule, so polling is cheap and every open tab sees the same data.
export function useScanner() {
  const [state, setState] = useState(null);
  const [connectionError, setConnectionError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/scanner`);

      if (!response.ok) {
        throw new Error(`Scanner request failed: ${response.status}`);
      }

      setState(await response.json());
      setConnectionError("");
    } catch (error) {
      console.error("Scanner error:", error);
      setConnectionError(
        "Can't reach the scanner server. If it's hosted on Render's free plan it may be waking up, which can take about a minute.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const scanning = Boolean(state?.scanning);

  useEffect(() => {
    let cancelled = false;
    let timer;

    const poll = async () => {
      await refresh();

      if (!cancelled) {
        timer = setTimeout(poll, scanning ? POLL_WHILE_SCANNING_MS : POLL_MS);
      }
    };

    timer = setTimeout(poll, scanning ? POLL_WHILE_SCANNING_MS : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh, scanning]);

  const scanNow = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/scan`, { method: "POST" });
    } finally {
      await refresh();
    }
  }, [refresh]);

  return { state, loading, connectionError, scanNow };
}
