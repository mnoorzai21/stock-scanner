const test = require("node:test");
const assert = require("node:assert/strict");

const { summarizeNews } = require("../src/news");

const now = Date.parse("2026-10-15T14:00:00Z");
const hoursAgo = (hours) => new Date(now - hours * 3_600_000).toISOString();

test("returns the newest fresh, non-generic article", () => {
  const result = summarizeNews(
    [
      { headline: "ABCD wins FDA approval", created_at: hoursAgo(5), source: "a", url: "u1" },
      { headline: "ABCD signs supply deal", created_at: hoursAgo(1), source: "b", url: "u2" },
      { headline: "12 stocks moving in Thursday's pre-market session", created_at: hoursAgo(0.5) },
    ],
    { now },
  );

  assert.equal(result.isFresh, true);
  assert.equal(result.headline, "ABCD signs supply deal");
  assert.equal(result.ageInHours, 1);
});

test("rejects old and generic-only news", () => {
  const result = summarizeNews(
    [
      { headline: "ABCD announces offering", created_at: hoursAgo(30) },
      { headline: "Top gainers this morning", created_at: hoursAgo(1) },
    ],
    { now },
  );

  assert.equal(result.hasNews, true);
  assert.equal(result.isFresh, false);
  assert.equal(result.headline, null);
});

test("ignores market roundups that only tag the stock", () => {
  const roundup = {
    headline: "Crude Oil Moves Higher; Charles Schwab Shares Fall After Q3 Results",
    created_at: hoursAgo(5),
    symbols: ["SCHW", "WETO", "USO", "AAPL", "TSLA", "NVDA"],
  };

  const result = summarizeNews([roundup], { symbol: "WETO", now });

  assert.equal(result.hasNews, true);
  assert.equal(result.isFresh, false);
});

test("accepts dedicated articles about the stock", () => {
  const byTicker = summarizeNews(
    [
      {
        headline: "Netcapital (NCPL) wins contract with major bank",
        created_at: hoursAgo(2),
        symbols: ["NCPL", "JPM", "BAC", "C", "WFC"],
      },
    ],
    { symbol: "NCPL", now },
  );
  assert.equal(byTicker.isFresh, true);

  const pressRelease = summarizeNews(
    [{ headline: "Netcapital Announces Q2 Results", created_at: hoursAgo(2), symbols: ["NCPL"] }],
    { symbol: "NCPL", now },
  );
  assert.equal(pressRelease.isFresh, true);
});

test("matches the ticker as a whole word only", () => {
  const result = summarizeNews(
    [{ headline: "AIRLINES rally on lower fuel costs", created_at: hoursAgo(1), symbols: ["AAL", "DAL", "UAL", "LUV", "AI"] }],
    { symbol: "AI", now },
  );

  assert.equal(result.isFresh, false);
});

test("treats 'what's behind the move' articles as generic", () => {
  const result = summarizeNews(
    [{ headline: "ABCD Stock Climbs 19% After Hours: What's Behind the Move?", created_at: hoursAgo(1), symbols: ["ABCD"] }],
    { symbol: "ABCD", now },
  );

  assert.equal(result.isFresh, false);
});

test("handles no articles", () => {
  assert.equal(summarizeNews([], { now }).hasNews, false);
});
