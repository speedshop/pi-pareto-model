import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { dominatorOf, paretoFront, rankVariants } from "../src/ranking.js";

type Metrics = { smart: number; fast: number; cheap: number };
type Variant = { id: string; name: string; creator: string; metrics: Metrics };

const variants: Variant[] = fixture.variants.map((variant) => ({
  id: variant.id,
  name: variant.displayName,
  creator: variant.creator,
  metrics: { ...variant.metrics },
}));

const ALLOCATIONS = {
  overall: { smart: 7.25, fast: 3.25, cheap: 1.5 },
  fast: { smart: 5, fast: 5.25, cheap: 1.75 },
  smart: { smart: 8, fast: 2.25, cheap: 1.75 },
  cheap: { smart: 1.25, fast: 1, cheap: 9.75 },
};
type AllocationName = keyof typeof ALLOCATIONS;

function rank(items: readonly Variant[], name: AllocationName, reference: readonly Variant[] = items) {
  return rankVariants(items, ALLOCATIONS[name], undefined, reference);
}

function withMetrics(metrics: Metrics[], prefix: string): Variant[] {
  return metrics.map((values, index) => ({ ...variants[index]!, id: `${prefix}-${index}`, metrics: values }));
}

describe("Pareto ranking", () => {
  it("removes only the intentionally dominated fixture variant and identifies its dominator", () => {
    const front = paretoFront(variants);
    const dominated = variants.find((variant) => variant.name === "GPT OSS 120B (medium)")!;
    expect(front).toHaveLength(13);
    expect(front).not.toContain(dominated);
    expect(dominatorOf(dominated, variants)?.name).toBeTruthy();
  });

  it("recomputes the frontier using only enabled axes", () => {
    const smartOnly = paretoFront(variants, ["smart"]);
    expect(smartOnly).toHaveLength(1);
    expect(smartOnly[0]?.name).toBe("Claude Opus 5 (high)");
  });

  it.each(["overall", "fast", "smart", "cheap"] satisfies AllocationName[])("orders %s deterministically", (name) => {
    const front = paretoFront(variants);
    const first = rank(front, name).map((variant) => variant.id);
    const second = rank([...front].reverse(), name).map((variant) => variant.id);
    expect(first).toEqual(second);
  });

  it("keeps scores and ordering stable when variants are filtered", () => {
    const reference = paretoFront(variants);
    const allocation = ALLOCATIONS.overall;
    const rankedFull = rankVariants(reference, allocation, undefined, reference);
    const keptIds = new Set(rankedFull.filter((_variant, index) => index % 2 === 0).map((variant) => variant.id));
    const rankedKept = rankVariants(
      reference.filter((variant) => keptIds.has(variant.id)),
      allocation,
      undefined,
      reference,
    );
    const fullScores = new Map(rankedFull.map((variant) => [variant.id, variant.ranking.worstRegret]));

    expect(rankedKept.map((variant) => variant.id)).toEqual(
      rankedFull.filter((variant) => keptIds.has(variant.id)).map((variant) => variant.id),
    );
    for (const variant of rankedKept) {
      expect(variant.ranking.worstRegret).toBe(fullScores.get(variant.id));
    }
  });

  it("uses linear Smart and Cost gaps and logarithmic Time gaps scaled by reference IQR", () => {
    const reference = withMetrics([
      { smart: 0, fast: 1, cheap: 0 },
      { smart: 10, fast: 2, cheap: 10 },
      { smart: 30, fast: 4, cheap: 30 },
      { smart: 40, fast: 8, cheap: 40 },
    ], "magnitude-reference");
    const contribution = (index: number, axis: "smart" | "fast" | "cheap") => rankVariants(
      [reference[index]!],
      { smart: 0, fast: 0, cheap: 0, [axis]: 12 },
      [axis],
      reference,
    )[0]!.ranking.contributions[axis];

    expect(contribution(2, "smart")).toBeCloseTo(0.4);
    expect(contribution(2, "cheap")).toBeCloseTo(1.2);
    expect(contribution(1, "fast")).toBeCloseTo(2 / 3);
    expect(contribution(2, "fast")).toBeCloseTo(4 / 3);
  });

  it("prioritizes the worst power-weighted regret over compensating improvements", () => {
    const reference = withMetrics([
      { smart: 0, fast: 1, cheap: 0 },
      { smart: 10, fast: 2, cheap: 10 },
      { smart: 30, fast: 4, cheap: 30 },
      { smart: 40, fast: 8, cheap: 40 },
    ], "worst-regret-reference");
    const lowerWorstRegret = { ...variants[0]!, id: "lower-worst-regret", metrics: { smart: 15, fast: 2 ** 1.5, cheap: 25 } };
    const lowerMeanRegret = { ...variants[1]!, id: "lower-mean-regret", metrics: { smart: 10, fast: 1, cheap: 0 } };

    const ranked = rankVariants(
      [lowerWorstRegret, lowerMeanRegret],
      { smart: 4, fast: 4, cheap: 4 },
      undefined,
      reference,
    );
    expect(ranked[0]?.id).toBe("lower-worst-regret");
    expect(ranked[0]?.ranking.worstRegret).toBeCloseTo(
      Math.max(...Object.values(ranked[0]!.ranking.contributions)),
    );
  });

  it("moves different tradeoffs to the top for focused allocations", () => {
    const front = paretoFront(variants);
    const top = (allocation: Metrics) => rankVariants(front, allocation)[0]?.name;
    expect(new Set([
      top({ smart: 12, fast: 0, cheap: 0 }),
      top({ smart: 0, fast: 12, cheap: 0 }),
      top({ smart: 0, fast: 0, cheap: 12 }),
    ]).size).toBeGreaterThan(1);
  });

  it("keeps Cheap visibly distinct when every cost is below one dollar", () => {
    const subDollar = variants.map((variant) => ({
      ...variant,
      metrics: { ...variant.metrics, cheap: variant.metrics.cheap / 100 },
    }));
    const front = paretoFront(subDollar);
    const smart = rank(front, "smart").slice(0, 5).map((variant) => variant.id);
    const cheap = rank(front, "cheap").slice(0, 5).map((variant) => variant.id);
    expect(cheap).not.toEqual(smart);
  });
});
