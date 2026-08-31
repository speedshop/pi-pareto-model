import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import type { ModelSelectionCatalog } from "../src/catalog/types.js";
import { buildCandidates } from "../src/routes/build-candidates.js";
import type { PiModel } from "../src/routes/types.js";

const catalog = fixture as unknown as ModelSelectionCatalog;

function model(provider: string, id: string, cost: [number, number, number, number]): PiModel {
  return {
    provider,
    id,
    name: id,
    api: "openai-completions",
    baseUrl: "https://example.invalid",
    reasoning: true,
    input: ["text"],
    cost: { input: cost[0], output: cost[1], cacheRead: cost[2], cacheWrite: cost[3] },
    contextWindow: 128000,
    maxTokens: 16000,
  } as PiModel;
}

function registry(all: PiModel[], available: PiModel[] = all, subscriptions: string[] = []): ModelRegistry {
  return {
    getAll: () => all,
    getAvailable: () => available,
    hasConfiguredAuth: (candidate: PiModel) => available.some((model) => model.provider === candidate.provider),
    isUsingOAuth: (candidate: PiModel) => subscriptions.includes(candidate.provider),
    getProvider: (provider: string) => subscriptions.includes(provider)
      ? { auth: { oauth: { isSubscription: true } } }
      : { auth: {} },
  } as unknown as ModelRegistry;
}

describe("route candidate construction", () => {
  it("matches only exact verified aliases", () => {
    const glm = model("baseten", "zai-org/GLM-5.2", [1, 2, 0.1, 0]);
    const candidates = buildCandidates(catalog, { scope: "available", registry: registry([glm]) });
    expect(candidates.map((candidate) => candidate.variant.displayName)).toEqual(["GLM-5.2 (high)"]);
  });

  it("uses an enabled subscription and removes metered equivalents", () => {
    const subscriptionCatalog = structuredClone(catalog);
    const variant = subscriptionCatalog.variants.find((candidate) => candidate.id === "fixture:model:gpt-5-5-high")!;
    variant.aliases.push({ provider: "fixture-metered", modelId: "gpt-5.5", piThinkingLevel: "high", equivalence: "verified" });
    const subscription = model("openai-codex", "gpt-5.5", [10, 10, 10, 10]);
    const metered = model("fixture-metered", "gpt-5.5", [1, 1, 1, 1]);
    const candidates = buildCandidates(subscriptionCatalog, {
      scope: "available",
      registry: registry([subscription, metered], [subscription, metered], ["openai-codex"]),
    });
    expect(candidates.filter((candidate) => candidate.variant.id === variant.id)).toHaveLength(1);
    expect(candidates.find((candidate) => candidate.variant.id === variant.id)).toMatchObject({ included: true, effectiveCost: 0, providerLabel: "openai-codex" });
  });

  it("restores a metered route when its subscription is disabled", () => {
    const subscriptionCatalog = structuredClone(catalog);
    const variant = subscriptionCatalog.variants.find((candidate) => candidate.id === "fixture:model:gpt-5-5-high")!;
    variant.aliases.push({ provider: "fixture-metered", modelId: "gpt-5.5", piThinkingLevel: "high", equivalence: "verified" });
    const subscription = model("openai-codex", "gpt-5.5", [10, 10, 10, 10]);
    const metered = model("fixture-metered", "gpt-5.5", [1, 1, 1, 1]);
    const candidates = buildCandidates(subscriptionCatalog, {
      scope: "available",
      registry: registry([subscription, metered], [subscription, metered], ["openai-codex"]),
      disabledSubscriptions: new Set(["openai-codex"]),
    });
    expect(candidates.filter((candidate) => candidate.variant.id === variant.id)).toHaveLength(1);
    expect(candidates.find((candidate) => candidate.variant.id === variant.id)?.providerLabel).toBe("fixture-metered");
  });

  it("includes unmatched variants only in the full catalog", () => {
    expect(buildCandidates(catalog, { scope: "available", registry: registry([]) })).toEqual([]);
    const full = buildCandidates(catalog, { scope: "full", registry: registry([]) });
    expect(full).toHaveLength(catalog.variants.length);
    expect(full.every((candidate) => !candidate.selectable)).toBe(true);
    for (const candidate of full) {
      const providers = [...new Set(candidate.variant.aliases
        .filter((alias) => alias.equivalence === "verified")
        .map((alias) => alias.provider))];
      expect(candidate.providerLabel).toBe(providers.join(", ") || "—");
    }
  });
});
