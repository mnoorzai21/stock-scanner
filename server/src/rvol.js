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
  // The whole session on each previous day, used when the matching window
  // had no volume (common for quiet stocks on a single-exchange feed).
  const fullSessions = new Map();
  const sessionMinutes = session.endMinutes - session.startMinutes;

  for (const date of [...historicalDates, marketDate]) {
    const start = easternTimeToUtc(date, session.startMinutes).getTime();
    windows.set(date, { start, end: start + elapsedMinutes * 60_000 });
    fullSessions.set(date, { start, end: start + sessionMinutes * 60_000 });
  }

  return {
    session,
    marketDate,
    historicalDates,
    elapsedMinutes,
    windows,
    fullSessions,
    rangeStart: new Date(windows.get(historicalDates[0]).start).toISOString(),
    rangeEnd: new Date(windows.get(marketDate).end).toISOString(),
  };
}

// Calculate RVOL for one symbol from its 5-minute bars.
//
// Returns one of:
//   { basis: "window", rvol, ... }   today vs the same window on past days
//   { basis: "session", rvol, ... }  that window was empty on every past day,
//                                    so today so far is compared with the
//                                    average full session (conservative)
//   { basis: "none", rvol: null, noHistory: true, ... }
//                                    no volume at all in the past 20 days,
//                                    but at least `minNoHistoryVolume`
//                                    shares traded today
//   null                             nothing usable
function computeRvol(bars, context, { minNoHistoryVolume = Infinity } = {}) {
  const windowVolume = new Map();
  const sessionVolumeByDate = new Map();

  for (const date of context.windows.keys()) {
    windowVolume.set(date, 0);
    sessionVolumeByDate.set(date, 0);
  }

  const fullSessions = context.fullSessions || new Map();

  for (const bar of bars || []) {
    const time = Date.parse(bar.t);
    const date = toEasternDate(time);
    const window = context.windows.get(date);
    const fullSession = fullSessions.get(date);

    if (window && time >= window.start && time < window.end) {
      windowVolume.set(date, windowVolume.get(date) + bar.v);
    }

    if (fullSession && time >= fullSession.start && time < fullSession.end) {
      sessionVolumeByDate.set(date, sessionVolumeByDate.get(date) + bar.v);
    }
  }

  const sessionVolume = windowVolume.get(context.marketDate);
  const averageOf = (volumes) =>
    context.historicalDates.reduce((sum, date) => sum + volumes.get(date), 0) /
    context.historicalDates.length;
  const daysWithVolume = (volumes) =>
    context.historicalDates.filter((date) => volumes.get(date) > 0).length;

  const windowAverage = averageOf(windowVolume);

  if (windowAverage > 0) {
    return {
      basis: "window",
      rvol: Number((sessionVolume / windowAverage).toFixed(2)),
      sessionVolume,
      averageHistoricalVolume: Math.round(windowAverage),
      daysWithVolume: daysWithVolume(windowVolume),
    };
  }

  const sessionAverage = averageOf(sessionVolumeByDate);

  if (sessionAverage > 0) {
    return {
      basis: "session",
      rvol: Number((sessionVolume / sessionAverage).toFixed(2)),
      sessionVolume,
      averageHistoricalVolume: Math.round(sessionAverage),
      daysWithVolume: daysWithVolume(sessionVolumeByDate),
    };
  }

  if (sessionVolume > 0 && sessionVolume >= minNoHistoryVolume) {
    return {
      basis: "none",
      rvol: null,
      noHistory: true,
      sessionVolume,
      averageHistoricalVolume: 0,
      daysWithVolume: 0,
    };
  }

  return null;
}

module.exports = { HISTORY_DAYS, getRvolContext, computeRvol };
