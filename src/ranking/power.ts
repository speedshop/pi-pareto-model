import { COMPARISON_AXES, type ComparisonAxis, type Preset } from "../routes/types.js";

export const TOTAL_POWER = 12;

export type PowerAllocation = Record<ComparisonAxis, number>;
export type PresetAllocations = Record<Preset, PowerAllocation>;
export type SubscriptionRoutes = "compete" | "only";
export type ParetoCost = "effective" | "reference";

export interface PresetDefinition {
  allocation: PowerAllocation;
  subscriptionRoutes: SubscriptionRoutes;
  paretoCost: ParetoCost;
}

export type PresetDefinitions = Record<Preset, PresetDefinition>;

export const DEFAULT_PRESETS: PresetDefinitions = {
  overall: {
    allocation: { smart: 6, fast: 3, cheap: 3 },
    subscriptionRoutes: "compete",
    paretoCost: "effective",
  },
  fast: {
    allocation: { smart: 4, fast: 6, cheap: 2 },
    subscriptionRoutes: "compete",
    paretoCost: "effective",
  },
  smart: {
    allocation: { smart: 8, fast: 2, cheap: 2 },
    subscriptionRoutes: "compete",
    paretoCost: "effective",
  },
  cheap: {
    allocation: { smart: 3, fast: 2, cheap: 7 },
    subscriptionRoutes: "only",
    paretoCost: "reference",
  },
};

export function isPowerAllocation(value: unknown): value is PowerAllocation {
  if (!value || typeof value !== "object") return false;
  const allocation = value as Record<string, unknown>;
  const values = COMPARISON_AXES.map((axis) => allocation[axis]);
  return values.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0)
    && values.reduce<number>((sum, item) => sum + (item as number), 0) === TOTAL_POWER;
}

export function isPresetAllocations(value: unknown): value is PresetAllocations {
  if (!value || typeof value !== "object") return false;
  const entries = Object.values(value);
  return entries.length > 0 && entries.every(isPowerAllocation);
}

export function allocationsFromPresets(presets: PresetDefinitions): PresetAllocations {
  return Object.fromEntries(Object.entries(presets).map(([name, preset]) => [name, { ...preset.allocation }]));
}

export function copyAllocations(allocations: PresetAllocations): PresetAllocations {
  return Object.fromEntries(Object.entries(allocations).map(([preset, allocation]) => [preset, { ...allocation }]));
}

export function enabledAxes(allocation: PowerAllocation): ComparisonAxis[] {
  return COMPARISON_AXES.filter((axis) => allocation[axis] > 0);
}

export function routePower(allocation: PowerAllocation, target: ComparisonAxis): PowerAllocation {
  const donor = COMPARISON_AXES
    .filter((axis) => axis !== target && allocation[axis] > 0)
    .sort((left, right) => allocation[right] - allocation[left] || COMPARISON_AXES.indexOf(left) - COMPARISON_AXES.indexOf(right))[0];
  if (!donor) return allocation;
  return {
    ...allocation,
    [donor]: allocation[donor] - 1,
    [target]: allocation[target] + 1,
  };
}
