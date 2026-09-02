import { COMPARISON_AXES, type Candidate, type ComparisonAxis, type RankingCalculation } from "../routes/types.js";
import type { PowerAllocation, SubscriptionRoutes } from "./power.js";

interface Regrets {
  smart: number;
  fast: number;
  cheap: number;
}

type RegretScale = (value: number) => number;
type MetricTransform = (value: number) => number;

function quantile(sorted: readonly number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * fraction;
}

function interquartileScale(
  values: readonly number[],
  higherIsBetter: boolean,
  transform: MetricTransform = (value) => value,
): RegretScale {
  const sorted = [...new Set(values.map(transform))].sort((left, right) => left - right);
  if (sorted.length <= 1) return () => 0;
  const spread = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const best = higherIsBetter ? sorted.at(-1)! : sorted[0]!;
  return (value) => {
    const difference = higherIsBetter ? best - transform(value) : transform(value) - best;
    return difference / spread;
  };
}

function regretScales(candidates: readonly Candidate[]) {
  return {
    smart: interquartileScale(candidates.map((candidate) => candidate.variant.metrics.smart), true),
    fast: interquartileScale(candidates.map((candidate) => candidate.variant.metrics.fast), false, Math.log),
    cheap: interquartileScale(candidates.map((candidate) => candidate.variant.metrics.cheap), false),
  };
}

function regrets(candidate: Candidate, scales: ReturnType<typeof regretScales>): Regrets {
  return {
    smart: scales.smart(candidate.variant.metrics.smart),
    fast: scales.fast(candidate.variant.metrics.fast),
    cheap: scales.cheap(candidate.variant.metrics.cheap),
  };
}

function rankingCalculation(
  values: Regrets,
  weights: Regrets,
  axes: readonly ComparisonAxis[],
): RankingCalculation {
  const totalPower = axes.reduce((sum, axis) => sum + weights[axis], 0);
  const contributions: Record<ComparisonAxis, number> = { smart: 0, fast: 0, cheap: 0 };
  if (totalPower > 0) {
    for (const axis of axes) contributions[axis] = values[axis] * weights[axis] / totalPower;
  }
  return {
    contributions,
    worstRegret: axes.reduce((worst, axis) => Math.max(worst, contributions[axis]), 0),
  };
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
  const ranked = candidates.map((candidate) => {
    const ranking = rankingCalculation(regrets(candidate, scales), allocation, axes);
    const meanRegret = axes.length === 0
      ? 0
      : axes.reduce((sum, axis) => sum + ranking.contributions[axis], 0) / axes.length;
    return { candidate: { ...candidate, ranking }, meanRegret };
  });
  return ranked.sort((left, right) =>
    left.candidate.ranking.worstRegret - right.candidate.ranking.worstRegret
      || left.meanRegret - right.meanRegret
      || left.candidate.variant.displayName.localeCompare(right.candidate.variant.displayName)
      || left.candidate.providerLabel.localeCompare(right.candidate.providerLabel)
  ).map(({ candidate }) => candidate);
}
