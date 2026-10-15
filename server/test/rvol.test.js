const test = require("node:test");
const assert = require("node:assert/strict");

const { getRvolContext, computeRvol } = require("../src/rvol");
const { weekdayCalendar, bars } = require("./helpers");

const calendar = weekdayCalendar("2026-09-01", "2026-10-15");
const REGULAR_OPEN = 9 * 60 + 30;

test("compares the same part of the session on the previous 20 days", () => {
  // 10:02 AM ET -> six completed 5-minute bars (9:30-10:00).
  const context = getRvolContext(new Date("2026-10-15T14:02:00Z"), calendar);

  assert.equal(context.session.session, "regular");
  assert.equal(context.elapsedMinutes, 30);
  assert.equal(context.historicalDates.length, 20);
  assert.equal(context.historicalDates.at(-1), "2026-10-14");
  assert.equal(context.rangeEnd, "2026-10-15T14:00:00.000Z");
});

test("waits for the first completed bar of a session", () => {
  const context = getRvolContext(new Date("2026-10-15T13:33:00Z"), calendar);

  assert.equal(context.windows, undefined);
  assert.match(context.reason, /first 5 minutes/);
});

test("reports closed markets and holidays", () => {
  assert.equal(getRvolContext(new Date("2026-10-15T03:00:00Z"), calendar).reason, "Markets are closed");
  // Saturday, premarket hours.
  assert.equal(
    getRvolContext(new Date("2026-10-17T12:00:00Z"), calendar).reason,
    "Today is not a trading day",
  );
});

test("computes RVOL only from bars inside each window", () => {
  const context = getRvolContext(new Date("2026-10-15T14:02:00Z"), calendar);
  const history = context.historicalDates.flatMap((date) => [
    ...bars(date, REGULAR_OPEN, 6, 1000), // inside the window
    ...bars(date, REGULAR_OPEN + 30, 6, 99999), // after the window: ignored
  ]);
  const today = [
    ...bars("2026-10-15", REGULAR_OPEN, 6, 8000),
    ...bars("2026-10-15", REGULAR_OPEN - 60, 6, 99999), // premarket: ignored
  ];

  const result = computeRvol([...history, ...today], context);

  assert.equal(result.averageHistoricalVolume, 6000);
  assert.equal(result.sessionVolume, 48000);
  assert.equal(result.rvol, 8);
  assert.equal(result.daysWithVolume, 20);
});

test("counts days without volume as zero and ignores symbols with no history", () => {
  const context = getRvolContext(new Date("2026-10-15T14:02:00Z"), calendar);
  const tenDays = context.historicalDates
    .slice(0, 10)
    .flatMap((date) => bars(date, REGULAR_OPEN, 6, 1000));

  const result = computeRvol(
    [...tenDays, ...bars("2026-10-15", REGULAR_OPEN, 6, 1000)],
    context,
  );

  assert.equal(result.averageHistoricalVolume, 3000);
  assert.equal(result.rvol, 2);
  assert.equal(computeRvol([], context), null);
});
