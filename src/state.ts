import type { ExtensionContext, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyAllocations, isPresetAllocations, type PresetAllocations } from "./ranking/power.js";

const SUBSCRIPTION_ENTRY_TYPE = "pareto-model-picker-subscriptions";
const ALLOCATION_ENTRY_TYPE = "pareto-model-picker-allocations";

interface SubscriptionStateEntry {
  disabled: string[];
}

export function restoreDisabledSubscriptions(ctx: ExtensionContext): Set<string> {
  const latest = ctx.sessionManager.getBranch()
    .filter((entry) => entry.type === "custom" && entry.customType === SUBSCRIPTION_ENTRY_TYPE)
    .at(-1);
  const data = latest?.type === "custom" ? latest.data as SubscriptionStateEntry | undefined : undefined;
  return new Set(data?.disabled ?? []);
}

export function saveDisabledSubscriptions(pi: ExtensionAPI, disabled: ReadonlySet<string>): void {
  pi.appendEntry(SUBSCRIPTION_ENTRY_TYPE, { disabled: [...disabled].sort() });
}

export function restoreAllocations(ctx: ExtensionContext): PresetAllocations | undefined {
  const latest = ctx.sessionManager.getBranch()
    .filter((entry) => entry.type === "custom" && entry.customType === ALLOCATION_ENTRY_TYPE)
    .at(-1);
  const data = latest?.type === "custom" ? latest.data : undefined;
  return isPresetAllocations(data) ? copyAllocations(data) : undefined;
}

export function saveAllocations(pi: ExtensionAPI, allocations: PresetAllocations): void {
  pi.appendEntry(ALLOCATION_ENTRY_TYPE, allocations);
}
