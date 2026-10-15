const test = require("node:test");
const assert = require("node:assert/strict");

const { parseRetryAfter, fetchWithRetry, fetchJson } = require("../src/http");

const noSleep = async () => {};

function response(status, body = {}, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

test("parses Retry-After seconds, dates and bad values", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");

  assert.equal(parseRetryAfter("3", now), 3000);
  assert.equal(parseRetryAfter("Thu, 15 Oct 2026 12:00:10 GMT", now), 10000);
  assert.equal(parseRetryAfter("999", now), 60000);
  assert.equal(parseRetryAfter(null, now), 5000);
  assert.equal(parseRetryAfter("soon", now), 5000);
});

test("retries rate limits and server errors, then succeeds", async () => {
  const replies = [response(429, {}, { "Retry-After": "1" }), response(503), response(200, { ok: true })];
  let calls = 0;

  const result = await fetchWithRetry(
    "https://example.com/x",
    {},
    { fetchImpl: async () => replies[calls++], sleepImpl: noSleep },
  );

  assert.equal(calls, 3);
  assert.equal(result.status, 200);
});

test("retries network failures", async () => {
  let calls = 0;

  const result = await fetchWithRetry(
    "https://example.com/x",
    {},
    {
      fetchImpl: async () => {
        calls++;
        if (calls === 1) throw new Error("socket hang up");
        return response(200);
      },
      sleepImpl: noSleep,
    },
  );

  assert.equal(result.status, 200);
});

test("fetchJson reports the status and body of failed requests", async () => {
  await assert.rejects(
    fetchJson("https://example.com/x", {}, {
      fetchImpl: async () => response(403, { message: "forbidden" }),
      sleepImpl: noSleep,
    }),
    (error) => error.status === 403 && /example\.com responded 403/.test(error.message),
  );
});
