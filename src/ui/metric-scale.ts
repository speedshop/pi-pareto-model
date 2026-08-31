import type { ComparisonAxis } from "../routes/types.js";

interface MetricRange {
  min: number;
  max: number;
  higherIsBetter: boolean;
}

export interface MetricValues {
  smart: number;
  fast: number;
  cheap: number;
}

export interface MetricScale {
  bar(axis: ComparisonAxis, value: number, width?: number): string;
}

const BLOCKS = "▁▂▃▄▅▆▇";
const PARTIAL_BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"] as const;

function quality(range: MetricRange, value: number): number {
  if (range.min === range.max) return 1;
  const normalized = (value - range.min) / (range.max - range.min);
  const oriented = range.higherIsBetter ? normalized : 1 - normalized;
  return Math.max(0, Math.min(1, oriented));
}

function verticalBar(value: number): string {
  return BLOCKS[Math.round(value * (BLOCKS.length - 1))]!;
}

function horizontalBar(value: number, width: number): string {
  const units = Math.round(value * width * 8);
  const full = Math.floor(units / 8);
  const partial = units % 8;
  const bar = "█".repeat(full) + (partial > 0 ? PARTIAL_BLOCKS[partial] : "");
  return bar + "·".repeat(width - full - (partial > 0 ? 1 : 0));
}

export function createMetricScale(values: readonly MetricValues[]): MetricScale {
  const range = (axis: ComparisonAxis, higherIsBetter: boolean): MetricRange => {
    const axisValues = values.map((metrics) => metrics[axis]);
    return { min: Math.min(...axisValues), max: Math.max(...axisValues), higherIsBetter };
  };
  const ranges: Record<ComparisonAxis, MetricRange> = {
    smart: range("smart", true),
    fast: range("fast", false),
    cheap: range("cheap", false),
  };

  return {
    bar(axis, value, width = 1) {
      const position = quality(ranges[axis], value);
      return width === 1 ? verticalBar(position) : horizontalBar(position, width);
    },
  };
}
