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
  premarket: "Premarket",
  regular: "Market open",
  afterhours: "After hours",
};
