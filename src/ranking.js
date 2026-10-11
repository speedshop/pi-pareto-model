export const AXES = ["smart", "fast", "cheap"];
export const TOTAL_POWER = 12;
export const POWER_STEP = 0.25;

export const DEFAULT_PRESETS = {
  overall: { smart: 7.25, fast: 3.25, cheap: 1.5 },
  fast: { smart: 5, fast: 5.25, cheap: 1.75 },
  smart: { smart: 8, fast: 2.25, cheap: 1.75 },
  cheap: { smart: 1.25, fast: 1, cheap: 9.75 },
};

function noWorse(left, right, axis) {
  return axis === "smart" ? left.metrics[axis] >= right.metrics[axis] : left.metrics[axis] <= right.metrics[axis];
}

function better(left, right, axis) {
  return axis === "smart" ? left.metrics[axis] > right.metrics[axis] : left.metrics[axis] < right.metrics[axis];
}

function dominates(left, right, axes = AXES) {
  return axes.every((axis) => noWorse(left, right, axis)) && axes.some((axis) => better(left, right, axis));
}

export function dominatorOf(variant, variants, axes = AXES) {
  return variants.find((other) => other !== variant && dominates(other, variant, axes));
}

export function paretoFront(variants, axes = AXES) {
  return variants.filter((variant) => dominatorOf(variant, variants, axes) === undefined);
}

export function isPowerAllocation(value) {
  if (!value || typeof value !== "object") return false;
  const values = AXES.map((axis) => value[axis]);
  return values.every((item) => typeof item === "number" && Number.isInteger(item / POWER_STEP) && item >= 0)
    && values.reduce((sum, item) => sum + item, 0) === TOTAL_POWER;
}

export function enabledAxes(allocation) {
  return AXES.filter((axis) => allocation[axis] > 0);
}

export function transferPower(allocation, donor, target) {
  if (donor === target || allocation[donor] < POWER_STEP) return allocation;
  return {
    ...allocation,
    [donor]: allocation[donor] - POWER_STEP,
    [target]: allocation[target] + POWER_STEP,
  };
}

function quantile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function interquartileScale(values, higherIsBetter, transform = (value) => value) {
  const sorted = [...new Set(values.map(transform))].sort((left, right) => left - right);
  if (sorted.length <= 1) return () => 0;
  const spread = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const best = higherIsBetter ? sorted.at(-1) : sorted[0];
  return (value) => (higherIsBetter ? best - transform(value) : transform(value) - best) / spread;
}

function regretScales(variants) {
  return {
    smart: interquartileScale(variants.map((variant) => variant.metrics.smart), true),
    fast: interquartileScale(variants.map((variant) => variant.metrics.fast), false, Math.log),
    cheap: interquartileScale(variants.map((variant) => variant.metrics.cheap), false),
  };
}

function rankingCalculation(variant, scales, allocation, axes) {
  const totalPower = axes.reduce((sum, axis) => sum + allocation[axis], 0);
  const contributions = { smart: 0, fast: 0, cheap: 0 };
  if (totalPower > 0) {
    for (const axis of axes) contributions[axis] = scales[axis](variant.metrics[axis]) * allocation[axis] / totalPower;
  }
  return {
    contributions,
    worstRegret: axes.reduce((worst, axis) => Math.max(worst, contributions[axis]), 0),
  };
}

export function rankVariants(variants, allocation, axes = AXES, referenceVariants = variants) {
  const scales = regretScales(referenceVariants);
  const ranked = variants.map((variant) => {
    const ranking = rankingCalculation(variant, scales, allocation, axes);
    const meanRegret = axes.length === 0
      ? 0
      : axes.reduce((sum, axis) => sum + ranking.contributions[axis], 0) / axes.length;
    return { variant: { ...variant, ranking }, meanRegret };
  });
  return ranked.sort((left, right) =>
    left.variant.ranking.worstRegret - right.variant.ranking.worstRegret
      || left.meanRegret - right.meanRegret
      || left.variant.name.localeCompare(right.variant.name)
  ).map(({ variant }) => variant);
}
