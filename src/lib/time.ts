/**
 * Small time formatting helpers used throughout the UI.
 * Centralized so we don't pull date-fns into client bundles where not needed.
 */

export function relativeTime(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null) return "—";
  const diff = now - ms;
  const abs = Math.abs(diff);
  const future = diff < 0;
  const units: [number, string, string][] = [
    [60_000, "sec", "s"],
    [60 * 60_000, "min", "m"],
    [24 * 60 * 60_000, "hr", "h"],
    [7 * 24 * 60 * 60_000, "day", "d"],
    [30 * 24 * 60 * 60_000, "wk", "w"],
    [365 * 24 * 60 * 60_000, "mo", "mo"],
  ];
  if (abs < units[0][0]) return future ? "in a moment" : "just now";
  for (let i = 0; i < units.length - 1; i++) {
    const [, , short] = units[i];
    const next = units[i + 1][0];
    if (abs < next) {
      const v = Math.floor(abs / units[i][0]);
      return future ? `in ${v}${short}` : `${v}${short} ago`;
    }
  }
  const years = Math.floor(abs / (365 * 24 * 60 * 60_000));
  return future ? `in ${years}y` : `${years}y ago`;
}

export function formatDate(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const d = Math.floor(hr / 24);
  return `${d}d ${hr % 24}h`;
}
