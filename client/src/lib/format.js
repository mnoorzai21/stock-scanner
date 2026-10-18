export function formatCompact(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatAge(hours) {
  if (!Number.isFinite(hours)) {
    return "";
  }

  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))}m ago`;
  }

  return `${Math.round(hours)}h ago`;
}

export function formatTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString() : "—";
}

export const SESSION_LABELS = {
  premarket: "Pre-market",
  regular: "Market open",
  afterhours: "After-hours",
  closed: "Market closed",
};

// "Mon 1:00 AM PDT" in the viewer's own time zone.
export function formatNextOpen(iso) {
  if (!iso) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}
