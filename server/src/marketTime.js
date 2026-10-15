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

module.exports = {
  SESSIONS,
  toEasternDate,
  easternMinutes,
  easternTimeToUtc,
  getTradingSession,
};
