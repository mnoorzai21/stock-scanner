const {
  getTradingSession,
  toEasternDate,
  easternTimeToUtc,
} = require("./marketTime");

const HISTORY_DAYS = 20;
const BAR_MINUTES = 5;

// Work out which time windows to compare for relative volume (RVOL).
//
// RVOL = volume so far in the current session
//        / average volume over the same part of the session on the
//          previous 20 trading days.
//
// Example: at 10:12 AM, today's 9:30-10:10 volume is compared with the
// 9:30-10:10 volume on each of the previous 20 trading days.
//
// `session` defaults to the clock-based session; the scanner passes the one
// from the trading calendar so early-close days use the right windows.
function getRvolContext(now, calendar, session = getTradingSession(now)) {

  if (!session) {
    return { reason: "Markets are closed" };
  }

  const marketDate = toEasternDate(now);
  const tradingDates = calendar.map((day) => day.date);

  if (!tradingDates.includes(marketDate)) {
    return { reason: "Today is not a trading day", session };
  }

  const historicalDates = tradingDates
    .filter((date) => date < marketDate)
    .slice(-HISTORY_DAYS);

  if (historicalDates.length < HISTORY_DAYS) {
    return { reason: "Not enough trading history for RVOL", session };
  }

  const sessionStart = easternTimeToUtc(marketDate, session.startMinutes);

  // Only use completed 5-minute bars.
  const elapsedMinutes = Math.min(
    Math.floor((now.getTime() - sessionStart.getTime()) / (BAR_MINUTES * 60_000)) *
      BAR_MINUTES,
    session.endMinutes - session.startMinutes,
  );

  if (elapsedMinutes < BAR_MINUTES) {
    return {
      reason: `Waiting for the first ${BAR_MINUTES} minutes of the ${session.session} session`,
      session,
    };
  }

  const windows = new Map();

  for (const date of [...historicalDates, marketDate]) {
    const start = easternTimeToUtc(date, session.startMinutes).getTime();
    windows.set(date, { start, end: start + elapsedMinutes * 60_000 });
  }

  return {
    session,
    marketDate,
    historicalDates,
    elapsedMinutes,
    windows,
    rangeStart: new Date(windows.get(historicalDates[0]).start).toISOString(),
    rangeEnd: new Date(windows.get(marketDate).end).toISOString(),
  };
}

// Calculate RVOL for one symbol from its 5-minute bars.
function computeRvol(bars, context) {
  const volumeByDate = new Map();

  for (const date of context.windows.keys()) {
    volumeByDate.set(date, 0);
  }

  for (const bar of bars || []) {
    const time = Date.parse(bar.t);
    const date = toEasternDate(time);
    const window = context.windows.get(date);

    if (window && time >= window.start && time < window.end) {
      volumeByDate.set(date, volumeByDate.get(date) + bar.v);
    }
  }

  const historical = context.historicalDates.map((date) =>
    volumeByDate.get(date),
  );
  const average =
    historical.reduce((sum, volume) => sum + volume, 0) / historical.length;

  if (!(average > 0)) {
    return null;
  }

  const sessionVolume = volumeByDate.get(context.marketDate);

  return {
    rvol: Number((sessionVolume / average).toFixed(2)),
    sessionVolume,
    averageHistoricalVolume: Math.round(average),
    daysWithVolume: historical.filter((volume) => volume > 0).length,
  };
}

module.exports = { HISTORY_DAYS, getRvolContext, computeRvol };
