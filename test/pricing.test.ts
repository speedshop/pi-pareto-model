import { describe, expect, it } from "vitest";
import { routePriceDominates, samePriceVector } from "../src/routes/pricing.js";
import type { PiModel, ProviderRoute } from "../src/routes/types.js";

function route(provider: string, rates: [number, number, number, number], options: { subscription?: boolean; tiers?: Array<[number, number, number, number, number]> } = {}): ProviderRoute {
  const [input, output, cacheRead, cacheWrite] = rates;
  return {
    alias: { provider, modelId: "model", equivalence: "verified" },
    model: {
      id: "model",
      name: "Model",
      provider,
      api: "openai-completions",
      baseUrl: "https://example.invalid",
      reasoning: true,
      input: ["text"],
      cost: {
        input,
        output,
        cacheRead,
        cacheWrite,
        ...(options.tiers ? { tiers: options.tiers.map(([inputTokensAbove, tierInput, tierOutput, tierCacheRead, tierCacheWrite]) => ({ inputTokensAbove, input: tierInput, output: tierOutput, cacheRead: tierCacheRead, cacheWrite: tierCacheWrite })) } : {}),
      },
      contextWindow: 128000,
      maxTokens: 16000,
    } as PiModel,
    available: true,
    subscription: options.subscription ?? false,
    current: false,
  };
}

describe("route price dominance", () => {
  it("recognizes a component-wise cheaper route", () => {
    expect(routePriceDominates(route("cheap", [1, 2, 0.1, 0]), route("expensive", [2, 4, 0.2, 0]))).toBe(true);
  });

  it("keeps routes with crossing rates", () => {
    const cheapInput = route("input", [1, 4, 0.1, 0]);
    const cheapOutput = route("output", [2, 2, 0.1, 0]);
    expect(routePriceDominates(cheapInput, cheapOutput)).toBe(false);
    expect(routePriceDominates(cheapOutput, cheapInput)).toBe(false);
  });

  it("treats an enabled subscription as dominant", () => {
    expect(routePriceDominates(route("sub", [9, 9, 9, 9], { subscription: true }), route("api", [1, 1, 1, 1]))).toBe(true);
  });

  it("compares all pricing tiers", () => {
    const baseCheaperLongExpensive = route("tiered", [1, 1, 1, 1], { tiers: [[100, 5, 5, 5, 5]] });
    const flat = route("flat", [2, 2, 2, 2]);
    expect(routePriceDominates(baseCheaperLongExpensive, flat)).toBe(false);
    expect(routePriceDominates(flat, baseCheaperLongExpensive)).toBe(false);
  });

  it("detects equal price vectors", () => {
    expect(samePriceVector(route("a", [1, 2, 3, 4]), route("b", [1, 2, 3, 4]))).toBe(true);
  });
});
