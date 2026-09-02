import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };
import type { ModelSelectionCatalog } from "../src/catalog/types.js";
import { allocationsFromPresets, copyAllocations, DEFAULT_PRESETS, type PresetDefinitions } from "../src/ranking/power.js";
import type { Candidate } from "../src/routes/types.js";
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
const theme = {
  fg: (_color: string, value: string) => value,
  bold: (value: string) => value,
} as Theme;

function createPicker(options: Omit<
  PickerOptions,
  "theme" | "presets" | "allocations" | "defaultAllocations" | "onAllocationChange" | "onSaveDefault"
> & {
  onAllocationChange?: PickerOptions["onAllocationChange"];
  onSaveDefault?: PickerOptions["onSaveDefault"];
}, presets: PresetDefinitions = DEFAULT_PRESETS): ModelPicker {
  const defaultAllocations = allocationsFromPresets(presets);
  return new ModelPicker({
    ...options,
    theme,
    presets: Object.keys(presets),
    allocations: copyAllocations(defaultAllocations),
    defaultAllocations,
    onAllocationChange: options.onAllocationChange ?? (() => {}),
    onSaveDefault: options.onSaveDefault ?? (() => {}),
  });
}

describe("model picker", () => {
  it("fills the available page, renders data columns, and marks the current model", () => {
    const picker = createPicker({ getCandidates: () => candidates, done: () => {} });
    const lines = picker.render(100);
    const rendered = lines.join("\n");
    expect(lines[0]).toContain("Preset:");
    expect(lines[0]).not.toContain("Smart ███▏··");
    expect(lines[1]).toContain("Smart ███▏··");
    expect(rendered).toContain("Smart ███▏··");
    expect(rendered).toContain("Time ██▏···");
    expect(rendered).toContain("Cost ▊·····");
    expect(rendered).toContain("Model variant");
    expect(rendered).toContain("Provider");
    expect(rendered).toContain("Smart");
    expect(rendered).toContain("✓");
    expect(rendered).toContain("1–9 of 9");
    expect(rendered).toContain("$4.500 ·incl");
    expect(rendered).toContain("power: s/t/c target · tab preset · r reset · p save");
    expect(rendered).toContain("/ search · d dominated · a all · u subs");
  });

  it("renders the fractional Fast Power Allocation", () => {
    const picker = createPicker({ initialPreset: "fast", getCandidates: () => candidates, done: () => {} });
    expect(picker.render(100)[1]).toContain("Smart ██▌···  Time ██▋···  Cost ▉·····");
  });

  it("gives Smart, Time, and Cost equal-width columns", () => {
    const header = createPicker({ getCandidates: () => candidates, done: () => {} })
      .render(100)
      .find((line) => line.includes("Model variant"))!;
    expect(header.indexOf("Time") - header.indexOf("Smart"))
      .toBe(header.indexOf("Cost") - header.indexOf("Time"));
  });

  it("keeps every line within the available width", () => {
    const picker = createPicker({ getCandidates: () => candidates, done: () => {} });
    for (const width of [20, 22, 30, 40, 45, 55, 70, 80, 120]) {
      expect(picker.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
    }
  });

  it("scales metric microbars to the current candidate list", () => {
    const picker = createPicker({ getCandidates: () => candidates.slice(0, 2), done: () => {} });
    const rendered = picker.render(100).join("\n");
    expect(rendered).toContain("99 ████");
    expect(rendered).toContain("96 ····");
  });

  it("renders each candidate on one line at narrow widths", () => {
    const lines = createPicker({ getCandidates: () => candidates, done: () => {} }).render(45);
    const header = lines.findIndex((line) => line.startsWith("Model variant"));
    const status = lines.findIndex((line) => line.includes(" of 9 ·"));
    expect(lines.slice(header + 1, status - 1)).toHaveLength(candidates.length);
  });

  it("marks truncated data labels with an ellipsis", () => {
    const longLabel = {
      ...candidates[0]!,
      variant: { ...candidates[0]!.variant, displayName: "A model variant name that cannot fit in its column" },
      providerLabel: "a-provider-name-that-cannot-fit",
    };
    const picker = createPicker({ getCandidates: () => [longLabel], done: () => {} });
    expect(picker.render(70).join("\n")).toContain("…");
  });

  it("pages, changes presets, and toggles full scope", () => {
    let result: PickerResult | undefined;
    const picker = createPicker({
      getCandidates: () => candidates,
      availableHeight: () => 16,
      done: (value) => { result = value; },
    });
    for (let index = 0; index < 8; index += 1) picker.handleInput("\x1b[B");
    expect(picker.render(100).join("\n")).toContain("8–9 of 9");
    picker.handleInput("\t");
    picker.handleInput("\t");
    expect(picker.render(100)[0]).toContain("smart");
    expect(picker.render(100).join("\n")).toContain("1–7 of 9");
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
    expect(picker.render(100).join("\n")).toContain("Preset: advisor ·");
    picker.handleInput("\t");
    expect(picker.render(100).join("\n")).toContain("Preset: planner ·");
    expect(picker.render(100).join("\n")).toContain("Smart ███···");
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
    picker.handleInput("c");
    for (let index = 0; index < 25; index += 1) picker.handleInput("s");
    for (let index = 0; index < 17; index += 1) picker.handleInput("t");
    const changedAllocation = picker.render(120).find((line) => line.includes("Smart"))!;
    expect(changedAllocation.indexOf("Time")).toBe(initialAllocation.indexOf("Time"));
    expect(changedAllocation.indexOf("Cost")).toBe(initialAllocation.indexOf("Cost"));
    const rendered = picker.render(100).join("\n");
    expect(activeAxes).toEqual(["cheap"]);
    expect(rendered).toContain("Smart ······");
    expect(rendered).toContain("Time ······");
    expect(rendered).toContain("1–9 of 9");
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
    picker.handleInput("s");
    expect(current).toEqual({ smart: 6, fast: 4.25, cheap: 1.75 });
    expect(picker.render(100).join("\n")).toContain("donor: s/t → Cost");
    picker.handleInput("p");
    expect(saved).toEqual(current);
    picker.handleInput("c");
    expect(picker.render(100).join("\n")).toContain("power*: s/t/c target");
    picker.handleInput("r");
    expect(current).toEqual(DEFAULT_PRESETS.overall!.allocation);
    expect(picker.render(100).join("\n")).toContain("power: s/t/c target");
  });

  it("exits donor mode before Escape closes the picker", () => {
    let doneCalls = 0;
    const picker = createPicker({ getCandidates: () => candidates, done: () => { doneCalls += 1; } });
    picker.handleInput("t");
    expect(picker.render(100).join("\n")).toContain("donor: s/c → Time");
    picker.handleInput("\x1b");
    expect(doneCalls).toBe(0);
    expect(picker.render(100).join("\n")).toContain("power: s/t/c target");
    picker.handleInput("\x1b");
    expect(doneCalls).toBe(1);
  });

  it("shows hidden ranking calculations after uppercase D", () => {
    const ranked = [{
      ...candidates[0]!,
      ranking: { contributions: { smart: 0.1, fast: 0.2, cheap: 0.05 }, worstRegret: 0.2 },
    }];
    const configuredPresets = structuredClone(DEFAULT_PRESETS);
    configuredPresets.overall!.allocation = { smart: 6, fast: 4.5, cheap: 1.5 };
    const picker = createPicker({ getCandidates: () => ranked, done: () => {} }, configuredPresets);
    picker.handleInput("D");
    const lines = picker.render(100);
    const rendered = lines.join("\n");
    expect(lines[1]).toBe("Smart 6*  Time 4.5*  Cost 1.5");
    expect(rendered).not.toContain("Smart ███");
    expect(rendered).toContain("Worst");
    expect(rendered).toContain("0.10");
    expect(rendered).toContain("0.20");
    expect(rendered).toContain("0.05");
    expect(rendered).toContain("0.200");
    expect(rendered).not.toContain("fixture-provider");
    expect(rendered).not.toContain("debug");
  });

  it("separates and labels dominated candidates", () => {
    let showDominated = false;
    const dominated = { ...candidates[8]!, dominatedBy: candidates[0]! };
    const picker = createPicker({
      getCandidates: (_preset, _scope, _axes, _allocation, nextShowDominated) => {
        showDominated = nextShowDominated;
        return nextShowDominated ? [...candidates.slice(0, 8), dominated] : candidates.slice(0, 8);
      },
      done: () => {},
    });
    picker.handleInput("d");
    const rendered = picker.render(120).join("\n");
    expect(rendered).toContain("· dominated shown");
    expect(rendered).toContain("← Claude Opus 5");
    expect(rendered).toContain("────────");
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
