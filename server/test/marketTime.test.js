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

const { getMarketStatus } = require("../src/marketTime");
const { weekdayCalendar } = require("./helpers");

test("market status is closed on weekends and points to Monday's pre-market", () => {
  const calendar = weekdayCalendar("2026-10-12", "2026-10-23");

  // Sunday, October 18, 2026 at 11:56 AM ET: regular hours by the clock.
  const status = getMarketStatus(new Date("2026-10-18T15:56:00Z"), calendar);

  assert.equal(status.session, null);
  // Monday 4:00 AM ET.
  assert.equal(status.nextOpen, "2026-10-19T08:00:00.000Z");
});

test("market status follows each session on a trading day", () => {
  const calendar = weekdayCalendar("2026-10-12", "2026-10-23");
  const at = (iso) => getMarketStatus(new Date(iso), calendar);

  assert.equal(at("2026-10-15T08:00:00Z").session.session, "premarket");
  assert.equal(at("2026-10-15T13:30:00Z").session.session, "regular");
  assert.equal(at("2026-10-15T20:00:00Z").session.session, "afterhours");
  assert.equal(at("2026-10-15T13:30:00Z").nextOpen, null);

  // 2:00 AM ET: closed, opens at 4:00 AM the same day.
  const early = at("2026-10-15T06:00:00Z");
  assert.equal(early.session, null);
  assert.equal(early.nextOpen, "2026-10-15T08:00:00.000Z");

  // 9:00 PM ET Friday: next open is Monday.
  assert.equal(at("2026-10-17T01:00:00Z").nextOpen, "2026-10-19T08:00:00.000Z");
});

test("market status treats holidays as closed", () => {
  // Thanksgiving, November 26, 2026, is missing from the calendar.
  const calendar = weekdayCalendar("2026-11-23", "2026-11-30").filter(
    (day) => day.date !== "2026-11-26",
  );

  const status = getMarketStatus(new Date("2026-11-26T15:00:00Z"), calendar);

  assert.equal(status.session, null);
  assert.equal(status.nextOpen, "2026-11-27T09:00:00.000Z");
});

test("market status uses early-close times from the calendar", () => {
  const calendar = [
    { date: "2026-11-27", open: "09:30", close: "13:00", session_open: "0400", session_close: "1700" },
  ];
  const at = (iso) => getMarketStatus(new Date(iso), calendar).session?.session ?? null;

  // EST (UTC-5): 12:59 PM, 1:00 PM, 4:59 PM and 5:00 PM ET.
  assert.equal(at("2026-11-27T17:59:00Z"), "regular");
  assert.equal(at("2026-11-27T18:00:00Z"), "afterhours");
  assert.equal(at("2026-11-27T21:59:00Z"), "afterhours");
  assert.equal(at("2026-11-27T22:00:00Z"), null);
});
