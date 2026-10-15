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

test("handles no articles", () => {
  assert.equal(summarizeNews([], { now }).hasNews, false);
});
