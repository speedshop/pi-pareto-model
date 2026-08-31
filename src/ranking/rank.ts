import { COMPARISON_AXES, type Candidate, type ComparisonAxis } from "../routes/types.js";
import type { PowerAllocation, SubscriptionRoutes } from "./power.js";

interface Regrets {
  smart: number;
  fast: number;
  cheap: number;
}

type PercentileScale = (value: number) => number;

function percentileScale(values: readonly number[], higherIsBetter: boolean): PercentileScale {
  const sorted = [...new Set(values)].sort((left, right) => higherIsBetter ? right - left : left - right);
  if (sorted.length <= 1) return () => 0;
  return (value) => {
    const better = sorted.filter((candidate) => higherIsBetter ? candidate > value : candidate < value).length;
    return Math.min(1, better / (sorted.length - 1));
  };
}

function regretScales(candidates: readonly Candidate[]) {
  return {
    smart: percentileScale(candidates.map((candidate) => candidate.variant.metrics.smart), true),
    fast: percentileScale(candidates.map((candidate) => candidate.variant.metrics.fast), false),
    cheap: percentileScale(candidates.map((candidate) => candidate.variant.metrics.cheap), false),
  };
}

function regrets(candidate: Candidate, scales: ReturnType<typeof regretScales>): Regrets {
  return {
    smart: scales.smart(candidate.variant.metrics.smart),
    fast: scales.fast(candidate.variant.metrics.fast),
    cheap: scales.cheap(candidate.variant.metrics.cheap),
  };
}

function scores(values: Regrets, weights: Regrets, axes: readonly ComparisonAxis[]): [number, number] {
  if (axes.length === 0) return [0, 0];
  const weighted = axes.map((axis) => values[axis] * weights[axis]);
  return [Math.max(...weighted), weighted.reduce((sum, value) => sum + value, 0) / weighted.length];
}

export function eligibleCandidates(candidates: readonly Candidate[], subscriptionRoutes: SubscriptionRoutes): Candidate[] {
  if (subscriptionRoutes !== "only" || !candidates.some((candidate) => candidate.included)) return [...candidates];
  return candidates.filter((candidate) => candidate.included);
}

export function rankCandidates(
  candidates: readonly Candidate[],
  allocation: PowerAllocation,
  axes: readonly ComparisonAxis[] = COMPARISON_AXES,
  referenceCandidates: readonly Candidate[] = candidates,
): Candidate[] {
  const scales = regretScales(referenceCandidates);
  return [...candidates].sort((left, right) => {
    const [leftMax, leftMean] = scores(regrets(left, scales), allocation, axes);
    const [rightMax, rightMean] = scores(regrets(right, scales), allocation, axes);
    return leftMax - rightMax
      || leftMean - rightMean
      || left.variant.displayName.localeCompare(right.variant.displayName)
      || left.providerLabel.localeCompare(right.providerLabel);
  });
}
