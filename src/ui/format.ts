import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type TimeUnit = "seconds" | "minutes";

export function padToWidth(value: string, width: number, ellipsis = ""): string {
  const truncated = truncateToWidth(value, width, ellipsis);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

export function padStartToWidth(value: string, width: number): string {
  const truncated = truncateToWidth(value, width, "");
  return " ".repeat(Math.max(0, width - visibleWidth(truncated))) + truncated;
}

export function formatSmart(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function timeUnit(values: readonly number[]): TimeUnit {
  return Math.max(0, ...values) >= 60 ? "minutes" : "seconds";
}

export function formatTime(seconds: number, unit: TimeUnit = seconds >= 60 ? "minutes" : "seconds"): string {
  const value = unit === "minutes" ? seconds / 60 : seconds;
  const suffix = unit === "minutes" ? "m" : "s";
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}${suffix}`;
}

export function formatCost(value: number): string {
  return `$${value.toFixed(3)}`;
}

export function formatProvider(value: string): string {
  const providers = value.split(", ");
  if (providers.length === 1) return value;
  return providers.map((provider) => provider.slice(0, 3)).join(", ");
}
