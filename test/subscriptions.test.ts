import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { isSubscriptionRoute } from "../src/routes/subscriptions.js";
import type { PiModel } from "../src/routes/types.js";

function model(provider: string): PiModel {
  return { provider, id: "model" } as PiModel;
}

function registry(options: { configured?: boolean; oauth?: boolean } = {}): ModelRegistry {
  return {
    hasConfiguredAuth: () => options.configured ?? true,
    isUsingOAuth: () => options.oauth ?? false,
  } as unknown as ModelRegistry;
}

describe("built-in subscription policy", () => {
  it("recognizes supported OAuth subscriptions only when OAuth is active", () => {
    expect(isSubscriptionRoute(model("openai-codex"), registry({ oauth: true }))).toBe(true);
    expect(isSubscriptionRoute(model("github-copilot"), registry({ oauth: false }))).toBe(false);
    expect(isSubscriptionRoute(model("xai"), registry({ oauth: true }))).toBe(true);
  });

  it("never treats Anthropic OAuth as included subscription usage", () => {
    expect(isSubscriptionRoute(model("anthropic"), registry({ oauth: true }))).toBe(false);
  });

  it("recognizes configured plan-specific API-key providers", () => {
    expect(isSubscriptionRoute(model("qwen-token-plan-individual"), registry({ configured: true }))).toBe(true);
    expect(isSubscriptionRoute(model("opencode-go"), registry({ configured: true }))).toBe(true);
    expect(isSubscriptionRoute(model("zai"), registry({ configured: false }))).toBe(false);
  });

  it("does not infer ambiguous API-key providers", () => {
    expect(isSubscriptionRoute(model("minimax"), registry({ configured: true }))).toBe(false);
    expect(isSubscriptionRoute(model("openrouter"), registry({ oauth: true }))).toBe(false);
  });
});
