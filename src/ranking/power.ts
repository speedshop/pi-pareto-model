import { COMPARISON_AXES, type ComparisonAxis, type Preset } from "../routes/types.js";

export const TOTAL_POWER = 12;
export const POWER_STEP = 0.25;

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
    allocation: { smart: 6.25, fast: 4.25, cheap: 1.5 },
    subscriptionRoutes: "compete",
    paretoCost: "effective",
  },
  fast: {
    allocation: { smart: 5, fast: 5.25, cheap: 1.75 },
    subscriptionRoutes: "compete",
    paretoCost: "effective",
  },
  smart: {
    allocation: { smart: 8, fast: 2.25, cheap: 1.75 },
    subscriptionRoutes: "compete",
    paretoCost: "effective",
  },
  cheap: {
    allocation: { smart: 1.25, fast: 1, cheap: 9.75 },
    subscriptionRoutes: "only",
    paretoCost: "reference",
  },
};

export function isPowerAllocation(value: unknown): value is PowerAllocation {
  if (!value || typeof value !== "object") return false;
  const allocation = value as Record<string, unknown>;
  const values = COMPARISON_AXES.map((axis) => allocation[axis]);
  return values.every((item) => typeof item === "number" && Number.isInteger(item / POWER_STEP) && item >= 0)
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

export function transferPower(
  allocation: PowerAllocation,
  donor: ComparisonAxis,
  target: ComparisonAxis,
): PowerAllocation {
  if (donor === target || allocation[donor] < POWER_STEP) return allocation;
  return {
    ...allocation,
    [donor]: allocation[donor] - POWER_STEP,
    [target]: allocation[target] + POWER_STEP,
  };
}
