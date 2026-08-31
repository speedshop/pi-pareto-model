import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { configuredPresets, loadConfig, saveConfiguredAllocation } from "./catalog/config.js";
import { loadCatalog } from "./catalog/load.js";
import type { ModelSelectionCatalog, ThinkingLevel } from "./catalog/types.js";
import { paretoFront } from "./ranking/pareto.js";
import { allocationsFromPresets, copyAllocations, DEFAULT_PRESETS, enabledAxes, type PowerAllocation, type PresetAllocations, type PresetDefinitions } from "./ranking/power.js";
import { eligibleCandidates, rankCandidates } from "./ranking/rank.js";
import { buildCandidates } from "./routes/build-candidates.js";
import { detectSubscriptionProviders } from "./routes/subscriptions.js";
import type { Candidate, CatalogScope, ComparisonAxis, PiModel, Preset } from "./routes/types.js";
import { restoreAllocations, restoreDisabledSubscriptions, saveAllocations, saveDisabledSubscriptions } from "./state.js";
import { createMetricColorScale } from "./ui/metric-colors.js";
import { ModelPicker, type PickerResult } from "./ui/picker.js";
import { SubscriptionPicker } from "./ui/subscriptions.js";

interface PickerResources {
  catalog: ModelSelectionCatalog;
  presets: PresetDefinitions;
  allocations: PresetAllocations;
  defaultAllocations: PresetAllocations;
  configPath: string;
}

export default function paretoModelPicker(pi: ExtensionAPI): void {
  let resourcesPromise: Promise<PickerResources> | undefined;
  let disabledSubscriptions = new Set<string>();
  let sessionAllocations: PresetAllocations | undefined;
  let presetSaveQueue = Promise.resolve();

  function restoreSessionState(ctx: ExtensionContext): void {
    disabledSubscriptions = restoreDisabledSubscriptions(ctx);
    sessionAllocations = restoreAllocations(ctx);
  }

  pi.on("session_start", (_event, ctx) => {
    restoreSessionState(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    restoreSessionState(ctx);
    resourcesPromise = undefined;
  });

  async function resourcesFor(ctx: ExtensionCommandContext): Promise<PickerResources> {
    resourcesPromise ??= loadConfig(ctx).then(async ({ config, path }) => {
      const presets = configuredPresets(config);
      const defaultAllocations = allocationsFromPresets(presets);
      const allocations = copyAllocations(defaultAllocations);
      for (const [name, allocation] of Object.entries(sessionAllocations ?? {})) {
        if (Object.hasOwn(allocations, name)) allocations[name] = { ...allocation };
      }
      return {
        catalog: await loadCatalog(
          config.source,
          config.cacheTtlHours === undefined ? {} : { ttlHours: config.cacheTtlHours },
        ),
        presets,
        allocations,
        defaultAllocations,
        configPath: path,
      };
    });
    try {
      return await resourcesPromise;
    } catch (error) {
      resourcesPromise = undefined;
      throw error;
    }
  }

  function custom<T>(ctx: ExtensionCommandContext, factory: Parameters<ExtensionCommandContext["ui"]["custom"]>[0]): Promise<T | undefined> {
    return ctx.ui.custom(factory) as Promise<T | undefined>;
  }

  async function showSubscriptions(ctx: ExtensionCommandContext): Promise<boolean> {
    const models = ctx.modelRegistry.getAvailable() as PiModel[];
    const providers = detectSubscriptionProviders(models, ctx.modelRegistry);
    const result = await custom<Set<string> | null>(ctx, (tui, theme, _keybindings, done) => {
      const picker = new SubscriptionPicker(providers, disabledSubscriptions, theme, done);
      return rerendering(picker, () => tui.requestRender());
    });
    if (!(result instanceof Set)) return false;
    disabledSubscriptions = result;
    saveDisabledSubscriptions(pi, disabledSubscriptions);
    return true;
  }

  function rerendering(component: Component, render: () => void): Component {
    return {
      render: (width) => component.render(width),
      invalidate: () => component.invalidate(),
      handleInput: (data) => {
        component.handleInput?.(data);
        render();
      },
    };
  }

  function rankedCandidates(
    catalog: ModelSelectionCatalog,
    scope: CatalogScope,
    ctx: ExtensionCommandContext,
    allocation: PowerAllocation,
    definition: PresetDefinitions[string],
    showDominated = false,
  ) {
    const candidates = buildCandidates(catalog, {
      scope,
      registry: ctx.modelRegistry,
      ...(ctx.model ? { currentModel: ctx.model as PiModel } : {}),
      currentThinkingLevel: pi.getThinkingLevel() as ThinkingLevel,
      disabledSubscriptions,
    });
    const axes = enabledAxes(allocation);
    const eligible = eligibleCandidates(candidates, definition.subscriptionRoutes);
    const referenceCandidates = eligible.map((candidate) => ({
      ...candidate,
      effectiveCost: candidate.variant.metrics.cheap,
    }));
    const referenceFrontier = paretoFront(referenceCandidates, axes);
    const effectiveFrontier = definition.paretoCost === "reference" ? referenceFrontier : paretoFront(eligible, axes);
    const rankedFrontier = rankCandidates(effectiveFrontier, allocation, axes, referenceFrontier);
    if (!showDominated) return rankedFrontier;
    const frontierKeys = new Set(effectiveFrontier.map((candidate) => candidate.key));
    const dominated = eligible.filter((candidate) => !frontierKeys.has(candidate.key));
    return [...rankedFrontier, ...rankCandidates(dominated, allocation, axes, referenceFrontier)];
  }

  async function selectCandidate(candidate: Candidate): Promise<boolean> {
    const route = candidate.route;
    if (!route || !(await pi.setModel(route.model as Model<Api>))) return false;
    if (candidate.thinkingLevel) pi.setThinkingLevel(candidate.thinkingLevel);
    return true;
  }

  async function selectTop(preset: Preset, ctx: ExtensionCommandContext): Promise<void> {
    try {
      const { catalog, allocations, presets } = await resourcesFor(ctx);
      const definition = Object.hasOwn(presets, preset) ? presets[preset] : undefined;
      if (!definition) {
        ctx.ui.notify(`Unknown Preset: ${preset}`, "warning");
        return;
      }
      const candidate = rankedCandidates(catalog, "available", ctx, allocations[preset]!, definition)[0];
      if (!candidate || !(await selectCandidate(candidate))) {
        ctx.ui.notify(`No selectable model is available for the ${preset} preset.`, "warning");
      }
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  pi.registerCommand("pareto", {
    description: "Select a Pareto-efficient model by Smart, Time, and Cost",
    handler: async (args, ctx) => {
      const requestedPreset = args.trim();
      if (requestedPreset) {
        await selectTop(requestedPreset, ctx);
        return;
      }
      if (ctx.mode !== "tui") {
        ctx.ui.notify("The Pareto model picker requires interactive TUI mode.", "warning");
        return;
      }

      let resources: PickerResources;
      try {
        resources = await resourcesFor(ctx);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      const { catalog, presets, allocations, defaultAllocations, configPath } = resources;
      const presetNames = Object.keys(presets);
      const metricColors = createMetricColorScale(catalog.variants);
      let preset: Preset = presetNames[0]!;
      let scope: CatalogScope = "available";
      let showDominated = false;
      let query = "";
      while (true) {
        const getCandidates = (
          nextPreset: Preset,
          nextScope: CatalogScope,
          _nextAxes: readonly ComparisonAxis[],
          allocation: PowerAllocation,
          nextShowDominated: boolean,
        ) => rankedCandidates(catalog, nextScope, ctx, allocation, presets[nextPreset]!, nextShowDominated);

        const result = await custom<PickerResult>(ctx, (tui, theme, _keybindings, done) => {
          const picker = new ModelPicker({
            theme,
            initialPreset: preset,
            initialScope: scope,
            presets: presetNames,
            allocations,
            defaultAllocations,
            onAllocationChange: (changedPreset, allocation) => {
              allocations[changedPreset] = allocation;
              sessionAllocations = copyAllocations(allocations);
              saveAllocations(pi, sessionAllocations);
            },
            onSaveDefault: (changedPreset, allocation) => {
              const save = presetSaveQueue.then(() => saveConfiguredAllocation(configPath, changedPreset, allocation, presets));
              presetSaveQueue = save.catch(() => {});
              void save.then(() => {
                defaultAllocations[changedPreset] = allocation;
                presets[changedPreset]!.allocation = allocation;
                ctx.ui.notify(`Saved ${changedPreset} Power Allocation as the default.`, "info");
              }, (error: unknown) => {
                ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
              });
            },
            initialShowDominated: showDominated,
            initialQuery: query,
            getCandidates,
            metricColors,
            done,
          });
          return rerendering(picker, () => tui.requestRender());
        });
        if (!result) return;

        preset = result.preset;
        scope = result.scope;
        showDominated = result.showDominated;
        query = result.query;
        if (result.type === "subscriptions") {
          await showSubscriptions(ctx);
          continue;
        }

        if (await selectCandidate(result.candidate)) return;
      }
    },
  });

  for (const preset of Object.keys(DEFAULT_PRESETS)) {
    pi.registerCommand(`pareto-${preset}`, {
      description: `Select the top model for the ${preset} Preset`,
      handler: async (_args, ctx) => selectTop(preset, ctx),
    });
  }
}
