import { describe, expect, it } from "vitest";
import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import type { ModelSelectionCatalog } from "../src/catalog/types.js";
import { createMetricScale } from "../src/ui/metric-scale.js";

const catalog = fixture as unknown as ModelSelectionCatalog;
const metrics = catalog.variants.map((variant) => variant.metrics);

describe("metric position scale", () => {
  it("renders taller blocks for better values on every axis", () => {
    const scale = createMetricScale(metrics);
    const smart = metrics.map((value) => value.smart);
    const time = metrics.map((value) => value.fast);
    const cost = metrics.map((value) => value.cheap);

    expect(scale.bar("smart", Math.max(...smart))).toBe("▇");
    expect(scale.bar("smart", Math.min(...smart))).toBe("▁");
    expect(scale.bar("fast", Math.min(...time))).toBe("▇");
    expect(scale.bar("fast", Math.max(...time))).toBe("▁");
    expect(scale.bar("cheap", Math.min(...cost))).toBe("▇");
    expect(scale.bar("cheap", Math.max(...cost))).toBe("▁");
  });

  it("uses linear distance rather than rank", () => {
    const scale = createMetricScale([
      { smart: 0, fast: 0, cheap: 0 },
      { smart: 1, fast: 1, cheap: 1 },
      { smart: 100, fast: 100, cheap: 100 },
    ]);
    expect(scale.bar("smart", 1)).toBe("▁");
  });

  it("renders higher-resolution linear microbars", () => {
    const scale = createMetricScale([
      { smart: 0, fast: 0, cheap: 0 },
      { smart: 100, fast: 100, cheap: 100 },
    ]);
    expect(scale.bar("smart", 0, 4)).toBe("····");
    expect(scale.bar("smart", 72, 4)).toBe("██▉·");
    expect(scale.bar("smart", 100, 4)).toBe("████");
  });

  it("treats an included subscription cost as best", () => {
    const scale = createMetricScale(metrics);
    expect(scale.bar("cheap", 0)).toBe("▇");
  });
});
