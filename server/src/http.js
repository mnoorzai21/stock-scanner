const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRY_DELAY_MS = 60_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Convert a Retry-After header (seconds or HTTP date) into milliseconds.
function parseRetryAfter(value, now = Date.now(), fallbackMs = 5000) {
  if (value === null || value === undefined || value === "") {
    return fallbackMs;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }

  const date = Date.parse(value);

  if (Number.isFinite(date)) {
    return Math.min(Math.max(0, date - now), MAX_RETRY_DELAY_MS);
  }

  return fallbackMs;
}

// fetch() with a timeout and retries for network errors, HTTP 429 and 5xx.
async function fetchWithRetry(url, options = {}, settings = {}) {
  const {
    fetchImpl = fetch,
    retries = 2,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    sleepImpl = sleep,
  } = settings;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;

    try {
      response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleepImpl(1000 * 2 ** attempt);
        continue;
      }

      throw new Error(
        `Request to ${new URL(url).hostname} failed: ${error.message}`,
      );
    }

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable || attempt === retries) {
      return response;
    }

    const delay =
      response.status === 429
        ? parseRetryAfter(response.headers.get("Retry-After"))
        : 1000 * 2 ** attempt;

    console.warn(
      `${new URL(url).hostname} returned ${response.status}. Retrying in ${delay / 1000}s...`,
    );

    await sleepImpl(delay);
  }

  throw lastError;
}

// Fetch JSON and turn non-2xx responses into readable errors.
async function fetchJson(url, options, settings) {
  const response = await fetchWithRetry(url, options, settings);

  if (!response.ok) {
    let detail = "";

    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      // Ignore unreadable error bodies.
    }

    const error = new Error(
      `${new URL(url).hostname} responded ${response.status}${detail ? `: ${detail}` : ""}`,
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

module.exports = { sleep, parseRetryAfter, fetchWithRetry, fetchJson };
