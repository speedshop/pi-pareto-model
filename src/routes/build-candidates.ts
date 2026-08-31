import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ModelSelectionCatalog, ThinkingLevel } from "../catalog/types.js";
import { routePriceDominates, samePriceVector } from "./pricing.js";
import { isSubscriptionRoute } from "./subscriptions.js";
import type { Candidate, CatalogScope, PiModel, ProviderRoute } from "./types.js";

function modelKey(model: Pick<PiModel, "provider" | "id">): string {
  return `${model.provider}/${model.id}`;
}

function chooseEqualRoute(left: ProviderRoute, right: ProviderRoute): ProviderRoute {
  if (left.current !== right.current) return left.current ? left : right;
  if (left.available !== right.available) return left.available ? left : right;
  return left.model.provider.localeCompare(right.model.provider) <= 0 ? left : right;
}

function pruneRoutes(routes: ProviderRoute[]): ProviderRoute[] {
  const efficient = routes.filter((right) => !routes.some((left) =>
    left !== right
    && (left.available || !right.available)
    && routePriceDominates(left, right),
  ));

  const deduplicated: ProviderRoute[] = [];
  for (const route of efficient) {
    const equalIndex = deduplicated.findIndex((existing) => samePriceVector(existing, route));
    if (equalIndex === -1) {
      deduplicated.push(route);
    } else {
      deduplicated[equalIndex] = chooseEqualRoute(deduplicated[equalIndex]!, route);
    }
  }
  return deduplicated;
}

export interface BuildCandidatesOptions {
  scope: CatalogScope;
  registry: ModelRegistry;
  currentModel?: PiModel;
  currentThinkingLevel?: ThinkingLevel;
  disabledSubscriptions?: ReadonlySet<string>;
}

export function buildCandidates(catalog: ModelSelectionCatalog, options: BuildCandidatesOptions): Candidate[] {
  const allModels = options.registry.getAll() as PiModel[];
  const models = new Map(allModels.map((model) => [modelKey(model), model]));
  const available = new Set((options.registry.getAvailable() as PiModel[]).map(modelKey));
  const disabled = options.disabledSubscriptions ?? new Set<string>();
  const candidates: Candidate[] = [];

  for (const variant of catalog.variants) {
    const routes: ProviderRoute[] = [];
    for (const alias of variant.aliases) {
      if (alias.equivalence !== "verified") continue;
      const model = models.get(`${alias.provider}/${alias.modelId}`);
      if (!model) continue;
      const subscription = isSubscriptionRoute(model, options.registry);
      if (subscription && disabled.has(model.provider)) continue;

      const isAvailable = available.has(modelKey(model));
      if (options.scope === "available" && !isAvailable) continue;

      const thinking = alias.piThinkingLevel;
      routes.push({
        alias,
        model,
        available: isAvailable,
        subscription,
        current: options.currentModel?.provider === model.provider
          && options.currentModel.id === model.id
          && (thinking === undefined || thinking === options.currentThinkingLevel),
      });
    }

    for (const route of pruneRoutes(routes)) {
      const thinkingLevel = route.alias.piThinkingLevel;
      candidates.push({
        key: `${variant.id}::${route.model.provider}/${route.model.id}:${thinkingLevel ?? "default"}`,
        variant,
        route,
        providerLabel: route.model.provider,
        selectable: route.available,
        effectiveCost: route.subscription ? 0 : variant.metrics.cheap,
        included: route.subscription,
        current: route.current,
        ...(thinkingLevel === undefined ? {} : { thinkingLevel }),
      });
    }

    if (routes.length === 0 && options.scope === "full") {
      const providers = [...new Set(variant.aliases
        .filter((alias) => alias.equivalence === "verified")
        .map((alias) => alias.provider))];
      candidates.push({
        key: `${variant.id}::unmatched`,
        variant,
        providerLabel: providers.join(", ") || "—",
        selectable: false,
        effectiveCost: variant.metrics.cheap,
        included: false,
        current: false,
      });
    }
  }
  return candidates;
}
