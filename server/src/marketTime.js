// Helpers for U.S. market hours. All session times are in New York time.

const TIME_ZONE = "America/New_York";

const SESSIONS = [
  { session: "premarket", startMinutes: 4 * 60, endMinutes: 9 * 60 + 30 },
  { session: "regular", startMinutes: 9 * 60 + 30, endMinutes: 16 * 60 },
  { session: "afterhours", startMinutes: 16 * 60, endMinutes: 20 * 60 },
];

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// "YYYY-MM-DD" for the given instant in New York.
function toEasternDate(value) {
  return dateFormatter.format(new Date(value));
}

// Minutes since midnight in New York.
function easternMinutes(value) {
  const parts = timeFormatter.formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour").value);
  const minute = Number(parts.find((part) => part.type === "minute").value);

  return hour * 60 + minute;
}

// UTC offset in hours for New York on a given date (-4 in summer, -5 in winter).
function easternOffsetHours(date) {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
  })
    .formatToParts(noonUtc)
    .find((part) => part.type === "timeZoneName").value;

  return Number(name.replace("GMT", "")) || 0;
}

// Convert a New York wall-clock time (minutes after midnight) to a UTC Date.
function easternTimeToUtc(date, minutesOfDay) {
  const result = new Date(`${date}T00:00:00Z`);
  const offset = easternOffsetHours(date);

  result.setUTCMinutes(minutesOfDay - offset * 60);

  return result;
}

// The extended-hours session that contains `now`, or null when markets are closed.
function getTradingSession(now = new Date()) {
  const minutes = easternMinutes(now);

  return (
    SESSIONS.find(
      ({ startMinutes, endMinutes }) =>
        minutes >= startMinutes && minutes < endMinutes,
    ) || null
  );
}

// Parse an Alpaca calendar time ("09:30" or "0930") into minutes after midnight.
function parseCalendarTime(value, fallback) {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(String(value ?? "").trim());

  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

// The pre-market, regular and after-hours sessions for one Alpaca calendar
// day. Uses the calendar's own times, so early-close days (1:00 PM ET) end
// the regular session and after-hours at the right time.
function sessionsForDay(day) {
  const [premarket, regular, afterhours] = SESSIONS;
  const sessionOpen = parseCalendarTime(day.session_open, premarket.startMinutes);
  const open = parseCalendarTime(day.open, regular.startMinutes);
  const close = parseCalendarTime(day.close, regular.endMinutes);
  const sessionClose = parseCalendarTime(day.session_close, afterhours.endMinutes);

  return [
    { session: "premarket", startMinutes: sessionOpen, endMinutes: open },
    { session: "regular", startMinutes: open, endMinutes: close },
    { session: "afterhours", startMinutes: close, endMinutes: sessionClose },
  ].filter(({ startMinutes, endMinutes }) => endMinutes > startMinutes);
}

// The market's status at `now`, using Alpaca's trading calendar so weekends
// and holidays count as closed.
//
// Returns { session, nextOpen }:
//   session  - the active session object, or null when markets are closed
//   nextOpen - when the next session starts (ISO string), or null if the
//              calendar doesn't reach far enough to know
function getMarketStatus(now, calendar) {
  const marketDate = toEasternDate(now);
  const nowMs = new Date(now).getTime();
  const today = calendar.find((day) => day.date === marketDate);
  const session = today
    ? sessionsForDay(today).find(({ startMinutes, endMinutes }) => {
        const minutes = easternMinutes(now);

        return minutes >= startMinutes && minutes < endMinutes;
      }) || null
    : null;

  let nextOpen = null;

  if (!session) {
    const upcoming = calendar
      .filter((day) => day.date >= marketDate)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const day of upcoming) {
      const [first] = sessionsForDay(day);
      const start = first && easternTimeToUtc(day.date, first.startMinutes);

      if (start && start.getTime() > nowMs) {
        nextOpen = start.toISOString();
        break;
      }
    }
  }

  return { session, nextOpen };
}

module.exports = {
  SESSIONS,
  toEasternDate,
  easternMinutes,
  easternTimeToUtc,
  getTradingSession,
  sessionsForDay,
  getMarketStatus,
};
