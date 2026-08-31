import type { CatalogVariant } from "../catalog/types.js";
import type { ComparisonAxis } from "../routes/types.js";

interface MetricDistribution {
  values: number[];
  higherIsBetter: boolean;
}

export interface MetricColorScale {
  color(axis: ComparisonAxis, value: number, text: string): string;
}

function relativeIndex(distribution: MetricDistribution, value: number): number {
  const { values, higherIsBetter } = distribution;
  if (values.length <= 1) return 0;
  const better = values.filter((candidate) => higherIsBetter ? candidate > value : candidate < value).length;
  return Math.min(1, better / (values.length - 1));
}

function interpolate(start: number, end: number, amount: number): number {
  return Math.round(start + (end - start) * amount);
}

function rgbAt(index: number): [number, number, number] {
  const green = [34, 197, 94] as const;
  const yellow = [234, 179, 8] as const;
  const red = [239, 68, 68] as const;
  const [start, end, amount] = index <= 0.5
    ? [green, yellow, index * 2]
    : [yellow, red, (index - 0.5) * 2];
  return [
    interpolate(start[0], end[0], amount),
    interpolate(start[1], end[1], amount),
    interpolate(start[2], end[2], amount),
  ];
}

export function createMetricColorScale(variants: readonly CatalogVariant[]): MetricColorScale {
  const distribution = (axis: ComparisonAxis, higherIsBetter: boolean): MetricDistribution => ({
    values: [...new Set(variants.map((variant) => variant.metrics[axis]))],
    higherIsBetter,
  });
  const distributions: Record<ComparisonAxis, MetricDistribution> = {
    smart: distribution("smart", true),
    fast: distribution("fast", false),
    cheap: distribution("cheap", false),
  };

  return {
    color(axis, value, text) {
      const [red, green, blue] = rgbAt(relativeIndex(distributions[axis], value));
      return `\x1b[38;2;${red};${green};${blue}m${text}\x1b[39m`;
    },
  };
}
