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

  it("keeps scores and ordering stable when candidates are filtered", () => {
    const reference = paretoFront(candidates);
    const allocation = DEFAULT_PRESETS.overall!.allocation;
    const rankedFull = rankCandidates(reference, allocation, undefined, reference);
    const availableKeys = new Set(rankedFull.filter((_candidate, index) => index % 2 === 0).map((candidate) => candidate.key));
    const rankedAvailable = rankCandidates(
      reference.filter((candidate) => availableKeys.has(candidate.key)),
      allocation,
      undefined,
      reference,
    );
    const fullScores = new Map(rankedFull.map((candidate) => [candidate.key, candidate.ranking!.worstRegret]));

    expect(rankedAvailable.map((candidate) => candidate.key)).toEqual(
      rankedFull.filter((candidate) => availableKeys.has(candidate.key)).map((candidate) => candidate.key),
    );
    for (const candidate of rankedAvailable) {
      expect(candidate.ranking!.worstRegret).toBe(fullScores.get(candidate.key));
    }
  });

  it("uses linear Smart and Cost gaps and logarithmic Time gaps scaled by reference IQR", () => {
    const metricValues = [
      { smart: 0, fast: 1, cheap: 0 },
      { smart: 10, fast: 2, cheap: 10 },
      { smart: 30, fast: 4, cheap: 30 },
      { smart: 40, fast: 8, cheap: 40 },
    ];
    const reference = metricValues.map((metrics, index) => ({
      ...candidates[index]!,
      key: `magnitude-reference-${index}`,
      variant: { ...candidates[index]!.variant, metrics },
    }));
    const contribution = (index: number, axis: "smart" | "fast" | "cheap") => rankCandidates(
      [reference[index]!],
      { smart: 0, fast: 0, cheap: 0, [axis]: 12 },
      [axis],
      reference,
    )[0]!.ranking!.contributions[axis];

    expect(contribution(2, "smart")).toBeCloseTo(0.4);
    expect(contribution(2, "cheap")).toBeCloseTo(1.2);
    expect(contribution(1, "fast")).toBeCloseTo(2 / 3);
    expect(contribution(2, "fast")).toBeCloseTo(4 / 3);
  });

  it("prioritizes the worst power-weighted regret over compensating improvements", () => {
    const referenceMetrics = [
      { smart: 0, fast: 1, cheap: 0 },
      { smart: 10, fast: 2, cheap: 10 },
      { smart: 30, fast: 4, cheap: 30 },
      { smart: 40, fast: 8, cheap: 40 },
    ];
    const reference = referenceMetrics.map((metrics, index) => ({
      ...candidates[index]!,
      key: `worst-regret-reference-${index}`,
      variant: { ...candidates[index]!.variant, metrics },
    }));
    const lowerWorstRegret = {
      ...candidates[0]!,
      key: "lower-worst-regret",
      variant: { ...candidates[0]!.variant, metrics: { smart: 15, fast: 2 ** 1.5, cheap: 25 } },
    };
    const lowerMeanRegret = {
      ...candidates[1]!,
      key: "lower-mean-regret",
      variant: { ...candidates[1]!.variant, metrics: { smart: 10, fast: 1, cheap: 0 } },
    };

    const ranked = rankCandidates(
      [lowerWorstRegret, lowerMeanRegret],
      { smart: 4, fast: 4, cheap: 4 },
      undefined,
      reference,
    );
    expect(ranked[0]?.key).toBe("lower-worst-regret");
    expect(ranked[0]?.ranking?.worstRegret).toBeCloseTo(
      Math.max(...Object.values(ranked[0]!.ranking!.contributions)),
    );
  });

  it("moves different tradeoffs to the top for focused allocations", () => {
    const front = paretoFront(candidates);
    const top = (allocation: { smart: number; fast: number; cheap: number }) =>
      rankCandidates(front, allocation)[0]?.variant.displayName;
    expect(new Set([
      top({ smart: 12, fast: 0, cheap: 0 }),
      top({ smart: 0, fast: 12, cheap: 0 }),
      top({ smart: 0, fast: 0, cheap: 12 }),
    ]).size).toBeGreaterThan(1);
  });

  it("retains Reference Task Cost preferences when routes are Included", () => {
    const referenceCandidates = candidates
      .filter((candidate) => ["GPT-5.5 (low)", "GPT-5.5 (medium)", "GPT-5.5 (high)"].includes(candidate.variant.displayName));
    const includedCandidates = referenceCandidates
      .map((candidate) => ({ ...candidate, effectiveCost: 0, included: true }));
    const referenceFront = paretoFront(referenceCandidates);
    const overall = rank(paretoFront(includedCandidates), "overall", referenceFront);
    expect(overall[0]?.variant.displayName).toBe(rank(referenceFront, "overall")[0]?.variant.displayName);
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
    const smart = rank(front, "smart").slice(0, 5).map((candidate) => candidate.key);
    const cheap = rank(front, "cheap").slice(0, 5).map((candidate) => candidate.key);
    expect(cheap).not.toEqual(smart);
  });
});
