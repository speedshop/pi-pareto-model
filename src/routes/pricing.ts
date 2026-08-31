import type { ModelCost, ModelCostRates } from "@earendil-works/pi-ai";
import type { ProviderRoute } from "./types.js";

function ratesAt(cost: ModelCost, inputTokens: number): ModelCostRates {
  let rates: ModelCostRates = cost;
  let threshold = -1;
  for (const tier of cost.tiers ?? []) {
    if (inputTokens > tier.inputTokensAbove && tier.inputTokensAbove > threshold) {
      rates = tier;
      threshold = tier.inputTokensAbove;
    }
  }
  return rates;
}

function rateValues(rates: ModelCostRates): number[] {
  return [rates.input, rates.output, rates.cacheRead, rates.cacheWrite];
}

export function routePriceDominates(left: ProviderRoute, right: ProviderRoute): boolean {
  if (left.subscription !== right.subscription) return left.subscription;
  if (left.subscription) return false;

  const thresholds = new Set<number>([0]);
  for (const tier of [...(left.model.cost.tiers ?? []), ...(right.model.cost.tiers ?? [])]) {
    thresholds.add(tier.inputTokensAbove + 1);
  }

  let strictlyCheaper = false;
  for (const inputTokens of thresholds) {
    const leftRates = rateValues(ratesAt(left.model.cost, inputTokens));
    const rightRates = rateValues(ratesAt(right.model.cost, inputTokens));
    if (leftRates.some((rate, index) => rate > rightRates[index]!)) return false;
    if (leftRates.some((rate, index) => rate < rightRates[index]!)) strictlyCheaper = true;
  }
  return strictlyCheaper;
}

export function samePriceVector(left: ProviderRoute, right: ProviderRoute): boolean {
  if (left.subscription || right.subscription) return left.subscription === right.subscription;
  const thresholds = new Set<number>([0]);
  for (const tier of [...(left.model.cost.tiers ?? []), ...(right.model.cost.tiers ?? [])]) {
    thresholds.add(tier.inputTokensAbove + 1);
  }
  return [...thresholds].every((inputTokens) => {
    const leftRates = rateValues(ratesAt(left.model.cost, inputTokens));
    const rightRates = rateValues(ratesAt(right.model.cost, inputTokens));
    return leftRates.every((rate, index) => rate === rightRates[index]);
  });
}
