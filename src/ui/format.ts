import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function padToWidth(value: string, width: number): string {
  const truncated = truncateToWidth(value, width, "");
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

export function formatSmart(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  const minutes = seconds / 60;
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)}m`;
}

export function formatCost(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}
