const { easternTimeToUtc } = require("../src/marketTime");

// Weekdays from `start` to `end` (inclusive), as an Alpaca-style calendar.
function weekdayCalendar(start, end) {
  const days = [];
  const date = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);

  while (date <= last) {
    const weekday = date.getUTCDay();

    if (weekday !== 0 && weekday !== 6) {
      days.push({ date: date.toISOString().slice(0, 10), open: "09:30", close: "16:00" });
    }

    date.setUTCDate(date.getUTCDate() + 1);
  }

  return days;
}

// 5-minute bars starting at a New York time on a date.
function bars(date, startMinutes, count, volume) {
  const start = easternTimeToUtc(date, startMinutes).getTime();

  return Array.from({ length: count }, (_, i) => ({
    t: new Date(start + i * 5 * 60_000).toISOString().replace(".000", ""),
    v: volume,
  }));
}

module.exports = { weekdayCalendar, bars };
