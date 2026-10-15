const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getTradingSession,
  easternTimeToUtc,
  toEasternDate,
} = require("../src/marketTime");

test("detects each session during daylight time", () => {
  // October 15, 2026 is EDT (UTC-4).
  assert.equal(getTradingSession(new Date("2026-10-15T07:59:00Z")), null);
  assert.equal(getTradingSession(new Date("2026-10-15T08:00:00Z")).session, "premarket");
  assert.equal(getTradingSession(new Date("2026-10-15T13:29:00Z")).session, "premarket");
  assert.equal(getTradingSession(new Date("2026-10-15T13:30:00Z")).session, "regular");
  assert.equal(getTradingSession(new Date("2026-10-15T20:00:00Z")).session, "afterhours");
  assert.equal(getTradingSession(new Date("2026-10-16T00:00:00Z")), null);
});

test("detects the regular session during standard time", () => {
  // January 15, 2026 is EST (UTC-5).
  assert.equal(getTradingSession(new Date("2026-01-15T14:29:00Z")).session, "premarket");
  assert.equal(getTradingSession(new Date("2026-01-15T14:30:00Z")).session, "regular");
});

test("converts New York times to UTC across daylight saving", () => {
  assert.equal(
    easternTimeToUtc("2026-10-15", 9 * 60 + 30).toISOString(),
    "2026-10-15T13:30:00.000Z",
  );
  assert.equal(
    easternTimeToUtc("2026-01-15", 9 * 60 + 30).toISOString(),
    "2026-01-15T14:30:00.000Z",
  );
});

test("uses the New York date, not the UTC date", () => {
  // 11 PM in New York is already the next day in UTC.
  assert.equal(toEasternDate("2026-10-16T03:00:00Z"), "2026-10-15");
});
