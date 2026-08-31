import type { Theme } from "@earendil-works/pi-coding-agent";
import { decodeKittyPrintable, Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { enabledAxes, routePower, TOTAL_POWER, type PowerAllocation, type PresetAllocations } from "../ranking/power.js";
import type { Candidate, CatalogScope, ComparisonAxis, Preset } from "../routes/types.js";
import { formatCost, formatSmart, formatTime, padToWidth } from "./format.js";
import type { MetricColorScale } from "./metric-colors.js";

const PAGE_SIZE = 5;

interface PickerState {
  preset: Preset;
  scope: CatalogScope;
  showDominated: boolean;
  query: string;
}

export type PickerResult =
  | ({ type: "select"; candidate: Candidate } & PickerState)
  | ({ type: "subscriptions" } & PickerState)
  | null;

export interface PickerOptions {
  theme: Theme;
  initialPreset?: Preset;
  initialScope?: CatalogScope;
  presets: readonly Preset[];
  allocations: PresetAllocations;
  defaultAllocations: PresetAllocations;
  onAllocationChange: (preset: Preset, allocation: PowerAllocation) => void;
  onSaveDefault: (preset: Preset, allocation: PowerAllocation) => void;
  initialShowDominated?: boolean;
  initialQuery?: string;
  getCandidates: (
    preset: Preset,
    scope: CatalogScope,
    axes: readonly ComparisonAxis[],
    allocation: PowerAllocation,
    showDominated: boolean,
  ) => Candidate[];
  metricColors: MetricColorScale;
  done: (result: PickerResult) => void;
}

export class ModelPicker implements Component {
  private readonly theme: Theme;
  private readonly getCandidates: PickerOptions["getCandidates"];
  private readonly metricColors: MetricColorScale;
  private readonly presets: readonly Preset[];
  private readonly allocations: PresetAllocations;
  private readonly defaultAllocations: PresetAllocations;
  private readonly onAllocationChange: PickerOptions["onAllocationChange"];
  private readonly onSaveDefault: PickerOptions["onSaveDefault"];
  private readonly done: PickerOptions["done"];
  private preset: Preset;
  private scope: CatalogScope;
  private showDominated: boolean;
  private query: string;
  private searching = false;
  private selected = 0;

  constructor(options: PickerOptions) {
    this.theme = options.theme;
    this.getCandidates = options.getCandidates;
    this.metricColors = options.metricColors;
    this.presets = options.presets;
    this.allocations = options.allocations;
    this.defaultAllocations = options.defaultAllocations;
    this.onAllocationChange = options.onAllocationChange;
    this.onSaveDefault = options.onSaveDefault;
    this.done = options.done;
    this.preset = options.initialPreset ?? this.presets[0]!;
    this.scope = options.initialScope ?? "available";
    this.showDominated = options.initialShowDominated ?? false;
    this.query = options.initialQuery ?? "";
  }

  invalidate(): void {}

  private allocation(): PowerAllocation {
    return this.allocations[this.preset]!;
  }

  private enabledAxes(): ComparisonAxis[] {
    return enabledAxes(this.allocation());
  }

  private candidates(): Candidate[] {
    const candidates = this.getCandidates(
      this.preset,
      this.scope,
      this.enabledAxes(),
      this.allocation(),
      this.showDominated,
    );
    const terms = this.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return candidates;
    return candidates.filter((candidate) => {
      const route = candidate.route;
      const searchable = [
        candidate.variant.displayName,
        candidate.variant.creator,
        candidate.variant.checkpoint,
        candidate.providerLabel,
        route?.model.id,
      ].filter(Boolean).join(" ").toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }

  private state(): PickerState {
    return {
      preset: this.preset,
      scope: this.scope,
      showDominated: this.showDominated,
      query: this.query,
    };
  }

  private updateList(change: () => void): void {
    const selectedKey = this.candidates()[this.selected]?.key;
    change();
    const candidates = this.candidates();
    const matchingIndex = selectedKey ? candidates.findIndex((candidate) => candidate.key === selectedKey) : -1;
    this.selected = matchingIndex >= 0 ? matchingIndex : Math.min(this.selected, Math.max(0, candidates.length - 1));
  }

  private changePreset(index: number): void {
    this.preset = this.presets[(index + this.presets.length) % this.presets.length]!;
    this.selected = 0;
  }

  private applyAllocation(allocation: PowerAllocation): void {
    this.allocations[this.preset] = allocation;
    this.onAllocationChange(this.preset, allocation);
    this.selected = 0;
  }

  private addPower(axis: ComparisonAxis): void {
    const current = this.allocation();
    const allocation = routePower(current, axis);
    if (allocation !== current) this.applyAllocation(allocation);
  }

  private resetPower(): void {
    this.applyAllocation({ ...this.defaultAllocations[this.preset]! });
  }

  private savePower(): void {
    this.onSaveDefault(this.preset, { ...this.allocation() });
  }

  handleInput(data: string): void {
    if (this.searching) {
      if (matchesKey(data, Key.escape)) {
        this.searching = false;
        this.query = "";
        this.selected = 0;
        return;
      }
      if (matchesKey(data, Key.backspace)) {
        this.query = this.query.slice(0, -1);
        this.selected = 0;
        return;
      }
      const printable = data.length === 1 && data >= " " ? data : decodeKittyPrintable(data);
      if (printable !== undefined) {
        this.query += printable;
        this.selected = 0;
        return;
      }
    } else {
      if (matchesKey(data, Key.escape)) return this.done(null);
      if (data === "/") {
        this.searching = true;
        return;
      }
      if (data === "u") return this.done({ type: "subscriptions", ...this.state() });
      if (data === "s") return this.addPower("smart");
      if (data === "t") return this.addPower("fast");
      if (data === "c") return this.addPower("cheap");
      if (data === "r") return this.resetPower();
      if (data === "p") return this.savePower();
      if (data === "d") {
        this.showDominated = !this.showDominated;
        this.selected = 0;
        return;
      }
      if (data === "a") {
        this.updateList(() => { this.scope = this.scope === "available" ? "full" : "available"; });
        return;
      }
    }

    const candidates = this.candidates();
    const presetIndex = this.presets.indexOf(this.preset);
    if (matchesKey(data, Key.tab)) return this.changePreset(presetIndex + 1);
    if (matchesKey(data, Key.shift(Key.tab))) return this.changePreset(presetIndex - 1);
    if (matchesKey(data, Key.up)) this.selected = Math.max(0, this.selected - 1);
    if (matchesKey(data, Key.down)) this.selected = Math.min(Math.max(0, candidates.length - 1), this.selected + 1);
    if (matchesKey(data, Key.home)) this.selected = 0;
    if (matchesKey(data, Key.end)) this.selected = Math.max(0, candidates.length - 1);
    if (matchesKey(data, Key.enter)) {
      const candidate = candidates[this.selected];
      if (candidate?.selectable) this.done({ type: "select", candidate, ...this.state() });
    }
  }

  private isModified(preset: Preset = this.preset): boolean {
    const allocation = this.allocations[preset]!;
    const defaults = this.defaultAllocations[preset]!;
    return allocation.smart !== defaults.smart
      || allocation.fast !== defaults.fast
      || allocation.cheap !== defaults.cheap;
  }

  private presetLine(): string {
    const active = this.theme.fg("accent", this.theme.bold(this.preset));
    const labels = this.presets.map((preset) => preset === this.preset
      ? this.theme.fg("accent", this.theme.bold(preset))
      : this.theme.fg("muted", preset));
    return `Preset: ${active} (${this.presets.indexOf(this.preset) + 1}/${this.presets.length}) · ${labels.join(" | ")}`;
  }

  private allocationLine(): string {
    const allocation = this.allocation();
    const label = (axis: ComparisonAxis, name: string) => {
      const bars = "■".repeat(allocation[axis]);
      const content = allocation[axis] === 0
        ? this.theme.fg("dim", `${name} —`)
        : `${this.theme.fg("accent", this.theme.bold(name))} ${bars}`;
      return padToWidth(content, name.length + 1 + TOTAL_POWER);
    };
    return `${label("smart", "Smart")}  ${label("fast", "Time")}  ${label("cheap", "Cost")}`.trimEnd();
  }

  private topLines(width: number): string[] {
    const preset = this.presetLine();
    const allocation = this.allocationLine();
    const combined = `${preset}  ${allocation}`;
    return visibleWidth(combined) <= width ? [combined] : [preset, allocation];
  }

  private searchLine(): string {
    if (this.searching) return `Search: ${this.theme.fg("accent", `/${this.query}▏`)}`;
    return this.theme.fg("dim", "Search: / to type");
  }

  private label(text: string, candidate: Candidate, selected: boolean): string {
    if (!candidate.selectable) return this.theme.fg("dim", text);
    return selected ? this.theme.fg("accent", text) : text;
  }

  private axisHeader(axis: ComparisonAxis, text: string, width: number): string {
    const header = padToWidth(text, width);
    return this.allocation()[axis] > 0 ? header : this.theme.fg("dim", header);
  }

  private metric(axis: ComparisonAxis, value: number, text: string): string {
    return this.metricColors.color(axis, value, text);
  }

  private wideRow(candidate: Candidate, selected: boolean, width: number): string {
    const smartWidth = 7;
    const timeWidth = 8;
    const costWidth = 11;
    const providerWidth = Math.min(20, Math.max(12, Math.floor(width * 0.2)));
    const modelWidth = Math.max(16, width - smartWidth - timeWidth - costWidth - providerWidth - 6);
    const prefix = this.label(selected ? "› " : "  ", candidate, selected);
    const current = candidate.current ? " ✓" : "";
    const model = this.label(padToWidth(`${candidate.variant.displayName}${current}`, modelWidth), candidate, selected);
    const smart = this.metric("smart", candidate.variant.metrics.smart, padToWidth(formatSmart(candidate.variant.metrics.smart), smartWidth));
    const time = this.metric("fast", candidate.variant.metrics.fast, padToWidth(formatTime(candidate.variant.metrics.fast), timeWidth));
    const effectiveCost = candidate.included ? 0 : candidate.variant.metrics.cheap;
    const cost = this.metric("cheap", effectiveCost, padToWidth(candidate.included ? "Included" : formatCost(effectiveCost), costWidth));
    const provider = this.label(padToWidth(candidate.providerLabel, providerWidth), candidate, selected);
    return truncateToWidth(`${prefix}${model} ${smart} ${time} ${cost} ${provider}`, width, "");
  }

  private narrowRows(candidate: Candidate, selected: boolean, width: number): string[] {
    const prefix = this.label(selected ? "› " : "  ", candidate, selected);
    const current = candidate.current ? " ✓" : "";
    const model = this.label(`${candidate.variant.displayName}${current}`, candidate, selected);
    const smart = this.metric("smart", candidate.variant.metrics.smart, formatSmart(candidate.variant.metrics.smart));
    const time = this.metric("fast", candidate.variant.metrics.fast, formatTime(candidate.variant.metrics.fast));
    const effectiveCost = candidate.included ? 0 : candidate.variant.metrics.cheap;
    const cost = this.metric("cheap", effectiveCost, candidate.included ? "Included" : formatCost(effectiveCost));
    const provider = this.label(candidate.providerLabel, candidate, selected);
    return [
      truncateToWidth(`${prefix}${model}  Smart ${smart} · Time ${time}`, width, ""),
      truncateToWidth(`  ${provider} · ${cost}`, width, ""),
    ];
  }

  render(width: number): string[] {
    const candidates = this.candidates();
    if (this.selected >= candidates.length) this.selected = Math.max(0, candidates.length - 1);
    const pageStart = Math.floor(this.selected / PAGE_SIZE) * PAGE_SIZE;
    const page = candidates.slice(pageStart, pageStart + PAGE_SIZE);
    const lines = [
      ...this.topLines(width).map((line) => truncateToWidth(line, width, "")),
      "",
    ];

    if (width >= 70) {
      const providerWidth = Math.min(20, Math.max(12, Math.floor(width * 0.2)));
      const modelWidth = Math.max(16, width - 7 - 8 - 11 - providerWidth - 6);
      lines.push(truncateToWidth(
        padToWidth("Model variant", modelWidth + 2)
          + " " + this.axisHeader("smart", "Smart", 7)
          + " " + this.axisHeader("fast", "Time", 8)
          + " " + this.axisHeader("cheap", "Cost", 11)
          + " " + padToWidth("Provider", providerWidth),
        width,
        "",
      ));
      for (const [index, candidate] of page.entries()) {
        lines.push(this.wideRow(candidate, pageStart + index === this.selected, width));
      }
    } else {
      lines.push(truncateToWidth("Model variant · Smart · Time / Cost · Provider", width, ""));
      for (const [index, candidate] of page.entries()) {
        lines.push(...this.narrowRows(candidate, pageStart + index === this.selected, width));
      }
    }

    while (page.length < PAGE_SIZE) {
      lines.push("");
      if (width < 70) lines.push("");
      page.push(undefined as never);
    }

    const end = Math.min(pageStart + PAGE_SIZE, candidates.length);
    lines.push("");
    lines.push(truncateToWidth(
      `${candidates.length === 0 ? "0" : `${pageStart + 1}–${end}`} of ${candidates.length} · ${this.scope === "available" ? "available models" : "all models"}${this.showDominated ? " · dominated shown" : ""}`,
      width,
      "",
    ));
    lines.push(truncateToWidth(this.searchLine(), width, ""));
    lines.push(truncateToWidth(`power${this.isModified() ? "*" : ""}: tab preset · s/t/c change · r reset · p save`, width, ""));
    lines.push(truncateToWidth("/ search · d dominated · a all · u subs", width, ""));
    return lines;
  }
}
