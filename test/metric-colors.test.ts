import { describe, expect, it } from "vitest";
import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import type { ModelSelectionCatalog } from "../src/catalog/types.js";
import { createMetricColorScale } from "../src/ui/metric-colors.js";

const catalog = fixture as unknown as ModelSelectionCatalog;

describe("dataset-wide metric colors", () => {
  it("colors the dataset's best values green and worst values red", () => {
    const colors = createMetricColorScale(catalog.variants);
    const smart = catalog.variants.map((variant) => variant.metrics.smart);
    const time = catalog.variants.map((variant) => variant.metrics.fast);
    const cost = catalog.variants.map((variant) => variant.metrics.cheap);

    expect(colors.color("smart", Math.max(...smart), "best")).toContain("38;2;34;197;94m");
    expect(colors.color("smart", Math.min(...smart), "worst")).toContain("38;2;239;68;68m");
    expect(colors.color("fast", Math.min(...time), "best")).toContain("38;2;34;197;94m");
    expect(colors.color("fast", Math.max(...time), "worst")).toContain("38;2;239;68;68m");
    expect(colors.color("cheap", Math.min(...cost), "best")).toContain("38;2;34;197;94m");
    expect(colors.color("cheap", Math.max(...cost), "worst")).toContain("38;2;239;68;68m");
  });

  it("treats an included subscription cost as globally best", () => {
    const colors = createMetricColorScale(catalog.variants);
    expect(colors.color("cheap", 0, "Included")).toContain("38;2;34;197;94m");
  });
});
