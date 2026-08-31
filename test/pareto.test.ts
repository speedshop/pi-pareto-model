import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import type { ModelSelectionCatalog } from "../src/catalog/types.js";
import { dominatorOf, paretoFront } from "../src/ranking/pareto.js";
import { DEFAULT_PRESETS } from "../src/ranking/power.js";
import { eligibleCandidates, rankCandidates } from "../src/ranking/rank.js";
import type { Candidate, Preset } from "../src/routes/types.js";

const catalog = fixture as ModelSelectionCatalog;
const candidates: Candidate[] = catalog.variants.map((variant) => ({
  key: variant.id,
  variant,
  providerLabel: "fixture",
  selectable: true,
  effectiveCost: variant.metrics.cheap,
  included: false,
  current: false,
}));

function rank(items: readonly Candidate[], preset: Preset, reference: readonly Candidate[] = items): Candidate[] {
  return rankCandidates(items, DEFAULT_PRESETS[preset]!.allocation, undefined, reference);
}

describe("Pareto ranking", () => {
  it("removes only the intentionally dominated fixture variant and identifies its dominator", () => {
    const front = paretoFront(candidates);
    const dominated = candidates.find((candidate) => candidate.variant.displayName === "GPT OSS 120B (medium)")!;
    expect(front).toHaveLength(13);
    expect(front).not.toContain(dominated);
    expect(dominatorOf(dominated, candidates)?.variant.displayName).toBeTruthy();
  });

  it("recomputes the frontier using only enabled axes", () => {
    const smartOnly = paretoFront(candidates, ["smart"]);
    expect(smartOnly).toHaveLength(1);
    expect(smartOnly[0]?.variant.displayName).toBe("Claude Opus 5 (high)");
  });

  it.each(["overall", "fast", "smart", "cheap"] satisfies Preset[])("orders %s deterministically", (preset) => {
    const front = paretoFront(candidates);
    const first = rank(front, preset).map((candidate) => candidate.key);
    const second = rank([...front].reverse(), preset).map((candidate) => candidate.key);
    expect(first).toEqual(second);
  });

  it("exposes a normalized composite score in ranking order", () => {
    const ranked = rank(paretoFront(candidates), "overall");
    expect(ranked.every((candidate) => candidate.score !== undefined && candidate.score >= 0 && candidate.score <= 1)).toBe(true);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked.at(-1)!.score!);
  });

  it("moves different tradeoffs to the top for focused presets", () => {
    const front = paretoFront(candidates);
    const fast = rank(front, "fast")[0]?.variant.displayName;
    const smart = rank(front, "smart")[0]?.variant.displayName;
    const cheap = rank(front, "cheap")[0]?.variant.displayName;
    expect(new Set([fast, smart, cheap]).size).toBeGreaterThan(1);
  });

  it("retains Reference Task Cost preferences when routes are Included", () => {
    const referenceCandidates = candidates
      .filter((candidate) => ["GPT-5.5 (low)", "GPT-5.5 (medium)", "GPT-5.5 (high)"].includes(candidate.variant.displayName));
    const includedCandidates = referenceCandidates
      .map((candidate) => ({ ...candidate, effectiveCost: 0, included: true }));
    const overall = rank(paretoFront(includedCandidates), "overall", paretoFront(referenceCandidates));
    expect(overall[0]?.variant.displayName).toBe("GPT-5.5 (high)");
  });

  it("uses subscriptions for domination without reordering shared frontier variants", () => {
    const metrics = [
      { smart: 8, fast: 2, cheap: 4 },
      { smart: 7, fast: 3, cheap: 1 },
      { smart: 10, fast: 5, cheap: 5 },
    ];
    const referenceCandidates = metrics.map((metric, index) => ({
      ...candidates[index]!,
      key: `reference-${index}`,
      variant: { ...candidates[index]!.variant, metrics: metric },
      effectiveCost: metric.cheap,
    }));
    const referenceFront = paretoFront(referenceCandidates);
    const included = referenceCandidates.map((candidate, index) => index === 0
      ? { ...candidate, effectiveCost: 0, included: true }
      : candidate);
    const effectiveFront = paretoFront(included);
    expect(effectiveFront.map((candidate) => candidate.key)).not.toContain("reference-1");

    const sharedKeys = new Set(effectiveFront.map((candidate) => candidate.key));
    const expected = rank(referenceFront, "overall")
      .filter((candidate) => sharedKeys.has(candidate.key))
      .map((candidate) => candidate.key);
    const actual = rank(effectiveFront, "overall", referenceFront)
      .map((candidate) => candidate.key);
    expect(actual).toEqual(expected);
  });

  it("limits Cheap to Included routes when a subscription candidate exists", () => {
    const included = { ...candidates[0]!, included: true, effectiveCost: 0 };
    const metered = candidates[1]!;
    expect(eligibleCandidates([included, metered], "only")).toEqual([included]);
    expect(eligibleCandidates([included, metered], "compete")).toEqual([included, metered]);
    expect(eligibleCandidates([metered], "only")).toEqual([metered]);
  });

  it("keeps Cheap visibly distinct when every cost is below one dollar", () => {
    const subDollarCatalog = structuredClone(catalog);
    for (const variant of subDollarCatalog.variants) variant.metrics.cheap /= 100;
    const subDollarCandidates = subDollarCatalog.variants.map((variant) => ({
      key: variant.id,
      variant,
      providerLabel: "fixture",
      selectable: true,
      effectiveCost: variant.metrics.cheap,
      included: false,
      current: false,
    }));
    const front = paretoFront(subDollarCandidates);
    const overall = rank(front, "overall").slice(0, 5).map((candidate) => candidate.key);
    const cheap = rank(front, "cheap").slice(0, 5).map((candidate) => candidate.key);
    expect(cheap).not.toEqual(overall);
  });
});
