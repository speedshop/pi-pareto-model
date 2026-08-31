import type { CatalogVariant } from "../catalog/types.js";
import type { ComparisonAxis } from "../routes/types.js";

interface MetricRange {
  min: number;
  max: number;
  higherIsBetter: boolean;
}

export interface MetricScale {
  position(axis: ComparisonAxis, value: number): string;
}

const BLOCKS = "▁▂▃▄▅▆▇";

function blockAt(range: MetricRange, value: number): string {
  if (range.min === range.max) return BLOCKS.at(-1)!;
  const normalized = (value - range.min) / (range.max - range.min);
  const quality = range.higherIsBetter ? normalized : 1 - normalized;
  const index = Math.round(Math.max(0, Math.min(1, quality)) * (BLOCKS.length - 1));
  return BLOCKS[index]!;
}

export function createMetricScale(variants: readonly CatalogVariant[]): MetricScale {
  const range = (axis: ComparisonAxis, higherIsBetter: boolean): MetricRange => {
    const values = variants.map((variant) => variant.metrics[axis]);
    return { min: Math.min(...values), max: Math.max(...values), higherIsBetter };
  };
  const ranges: Record<ComparisonAxis, MetricRange> = {
    smart: range("smart", true),
    fast: range("fast", false),
    cheap: range("cheap", false),
  };

  return {
    position(axis, value) {
      return blockAt(ranges[axis], value);
    },
  };
}
