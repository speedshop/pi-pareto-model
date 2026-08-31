import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import type { ModelSelectionCatalog } from "../src/catalog/types.js";
import { allocationsFromPresets, copyAllocations, DEFAULT_PRESETS, type PresetDefinitions } from "../src/ranking/power.js";
import type { Candidate } from "../src/routes/types.js";
import { createMetricColorScale } from "../src/ui/metric-colors.js";
import { ModelPicker, type PickerOptions, type PickerResult } from "../src/ui/picker.js";

const catalog = fixture as unknown as ModelSelectionCatalog;
const candidates: Candidate[] = catalog.variants.slice(0, 9).map((variant, index) => ({
  key: variant.id,
  variant,
  providerLabel: index === 8 ? "—" : "fixture-provider",
  selectable: index !== 8,
  effectiveCost: variant.metrics.cheap,
  included: index === 2,
  current: index === 0,
}));
const metricColors = createMetricColorScale(catalog.variants);
const theme = {
  fg: (_color: string, value: string) => value,
  bold: (value: string) => value,
} as Theme;

function createPicker(options: Omit<
  PickerOptions,
  "theme" | "metricColors" | "presets" | "allocations" | "defaultAllocations" | "onAllocationChange" | "onSaveDefault"
> & {
  onAllocationChange?: PickerOptions["onAllocationChange"];
  onSaveDefault?: PickerOptions["onSaveDefault"];
}, presets: PresetDefinitions = DEFAULT_PRESETS): ModelPicker {
  const defaultAllocations = allocationsFromPresets(presets);
  return new ModelPicker({
    ...options,
    theme,
    metricColors,
    presets: Object.keys(presets),
    allocations: copyAllocations(defaultAllocations),
    defaultAllocations,
    onAllocationChange: options.onAllocationChange ?? (() => {}),
    onSaveDefault: options.onSaveDefault ?? (() => {}),
  });
}

describe("model picker", () => {
  it("renders five rows, columns, and the current-model checkmark", () => {
    const picker = createPicker({ getCandidates: () => candidates, done: () => {} });
    const rendered = picker.render(100).join("\n");
    expect(rendered).toContain("Model variant");
    expect(rendered).toContain("Provider");
    expect(rendered).toContain("Smart");
    expect(rendered).toContain("✓");
    expect(rendered).toContain("1–5 of 9");
    expect(rendered).toContain("power: tab preset · s/t/c change · r reset · p save");
    expect(rendered).toContain("/ search · d dominated · a all · u subs");
  });

  it("keeps every line within the available width", () => {
    const picker = createPicker({ getCandidates: () => candidates, done: () => {} });
    for (const width of [45, 80, 120]) {
      expect(picker.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
    }
  });

  it("pages, changes presets, and toggles full scope", () => {
    let result: PickerResult | undefined;
    const picker = createPicker({ getCandidates: () => candidates, done: (value) => { result = value; } });
    for (let index = 0; index < 5; index += 1) picker.handleInput("\x1b[B");
    expect(picker.render(100).join("\n")).toContain("6–9 of 9");
    picker.handleInput("\t");
    picker.handleInput("\t");
    expect(picker.render(100)[0]).toContain("smart");
    expect(picker.render(100).join("\n")).toContain("1–5 of 9");
    picker.handleInput("a");
    expect(picker.render(100).join("\n")).toContain("all models");
    picker.handleInput("u");
    expect(result).toMatchObject({ type: "subscriptions", preset: "smart", scope: "full" });
  });

  it("cycles through configured Presets", () => {
    const presets: PresetDefinitions = {
      advisor: { allocation: { smart: 12, fast: 0, cheap: 0 }, subscriptionRoutes: "compete", paretoCost: "effective" },
      planner: { allocation: { smart: 6, fast: 6, cheap: 0 }, subscriptionRoutes: "only", paretoCost: "reference" },
    };
    const picker = createPicker({ getCandidates: () => candidates, done: () => {} }, presets);
    expect(picker.render(100).join("\n")).toContain("Preset: advisor (1/2)");
    picker.handleInput("\t");
    expect(picker.render(100).join("\n")).toContain("Preset: planner (2/2)");
    expect(picker.render(100).join("\n")).toContain("Smart ■■■■■■");
  });

  it("routes power, can reduce axes to zero, and resets to item one", () => {
    let activeAxes: readonly string[] = [];
    const picker = createPicker({
      getCandidates: (_preset, _scope, axes) => {
        activeAxes = axes;
        return candidates;
      },
      done: () => {},
    });
    const initialAllocation = picker.render(120).find((line) => line.includes("Smart"))!;
    for (let index = 0; index < 5; index += 1) picker.handleInput("\x1b[B");
    for (let index = 0; index < 9; index += 1) picker.handleInput("c");
    const changedAllocation = picker.render(120).find((line) => line.includes("Smart"))!;
    expect(changedAllocation.indexOf("Time")).toBe(initialAllocation.indexOf("Time"));
    expect(changedAllocation.indexOf("Cost")).toBe(initialAllocation.indexOf("Cost"));
    const rendered = picker.render(100).join("\n");
    expect(activeAxes).toEqual(["cheap"]);
    expect(rendered).toContain("Smart —");
    expect(rendered).toContain("Time —");
    expect(rendered).toContain("1–5 of 9");
  });

  it("resets and saves the current Preset allocation", () => {
    let current = DEFAULT_PRESETS.overall!.allocation;
    let saved: typeof current | undefined;
    const picker = createPicker({
      getCandidates: () => candidates,
      onAllocationChange: (_preset, allocation) => { current = allocation; },
      onSaveDefault: (_preset, allocation) => { saved = allocation; },
      done: () => {},
    });
    picker.handleInput("c");
    expect(current).toEqual({ smart: 5, fast: 3, cheap: 4 });
    expect(picker.render(100).join("\n")).toContain("power*: tab preset");
    picker.handleInput("p");
    expect(saved).toEqual(current);
    picker.handleInput("r");
    expect(current).toEqual(DEFAULT_PRESETS.overall!.allocation);
    expect(picker.render(100).join("\n")).toContain("power: tab preset");
  });

  it("toggles dominated candidates", () => {
    let showDominated = false;
    const picker = createPicker({
      getCandidates: (_preset, _scope, _axes, _allocation, nextShowDominated) => {
        showDominated = nextShowDominated;
        return candidates;
      },
      done: () => {},
    });
    picker.handleInput("d");
    expect(picker.render(100).join("\n")).toContain("· dominated shown");
    expect(showDominated).toBe(true);
  });

  it("filters candidates as search text is typed", () => {
    let result: PickerResult | undefined;
    const picker = createPicker({
      getCandidates: () => candidates,
      done: (value) => { result = value; },
    });
    for (const character of "/kimi") picker.handleInput(character);
    const rendered = picker.render(100).join("\n");
    expect(rendered).toContain("Search: /kimi▏");
    expect(rendered).toContain("Kimi K3 (high)");
    expect(rendered).toContain("1–1 of 1");
    picker.handleInput("\r");
    expect(result).toMatchObject({ type: "select", candidate: { variant: { displayName: "Kimi K3 (high)" } } });
  });

  it("does not select an unavailable row", () => {
    let result: PickerResult | undefined;
    const picker = createPicker({ getCandidates: () => [candidates[8]!], done: (value) => { result = value; } });
    picker.handleInput("\r");
    expect(result).toBeUndefined();
  });
});
