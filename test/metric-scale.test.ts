import { describe, expect, it } from "vitest";
import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import type { ModelSelectionCatalog } from "../src/catalog/types.js";
import { createMetricScale } from "../src/ui/metric-scale.js";

const catalog = fixture as unknown as ModelSelectionCatalog;

describe("dataset-wide metric positions", () => {
  it("renders taller blocks for better values on every axis", () => {
    const scale = createMetricScale(catalog.variants);
    const smart = catalog.variants.map((variant) => variant.metrics.smart);
    const time = catalog.variants.map((variant) => variant.metrics.fast);
    const cost = catalog.variants.map((variant) => variant.metrics.cheap);

    expect(scale.position("smart", Math.max(...smart))).toBe("▇");
    expect(scale.position("smart", Math.min(...smart))).toBe("▁");
    expect(scale.position("fast", Math.min(...time))).toBe("▇");
    expect(scale.position("fast", Math.max(...time))).toBe("▁");
    expect(scale.position("cheap", Math.min(...cost))).toBe("▇");
    expect(scale.position("cheap", Math.max(...cost))).toBe("▁");
  });

  it("uses linear distance rather than rank among unique values", () => {
    const variants = catalog.variants.slice(0, 3).map((variant, index) => ({
      ...variant,
      metrics: { ...variant.metrics, smart: [0, 1, 100][index]! },
    }));
    const scale = createMetricScale(variants);
    expect(scale.position("smart", 1)).toBe("▁");
  });

  it("treats an included subscription cost as globally best", () => {
    const scale = createMetricScale(catalog.variants);
    expect(scale.position("cheap", 0)).toBe("▇");
  });
});
