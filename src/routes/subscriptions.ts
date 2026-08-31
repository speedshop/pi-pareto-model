import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { PiModel } from "./types.js";

export const API_KEY_SUBSCRIPTION_PROVIDERS = new Set([
  "kimi-coding",
  "zai",
  "zai-coding-cn",
  "opencode-go",
  "qwen-token-plan",
  "qwen-token-plan-individual",
  "qwen-token-plan-cn",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-sgp",
]);

export const OAUTH_SUBSCRIPTION_PROVIDERS = new Set([
  "openai-codex",
  "github-copilot",
  "xai",
]);

export function isSubscriptionRoute(model: PiModel, registry: ModelRegistry): boolean {
  if (API_KEY_SUBSCRIPTION_PROVIDERS.has(model.provider)) return registry.hasConfiguredAuth(model);
  return OAUTH_SUBSCRIPTION_PROVIDERS.has(model.provider) && registry.isUsingOAuth(model);
}

export function detectSubscriptionProviders(models: readonly PiModel[], registry: ModelRegistry): string[] {
  return [...new Set(models.filter((model) => isSubscriptionRoute(model, registry)).map((model) => model.provider))].sort();
}
