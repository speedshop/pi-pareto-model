import type { Theme } from "@earendil-works/pi-coding-agent";
import { decodeKittyPrintable, Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { DEFAULT_PRESETS, enabledAxes, TOTAL_POWER, transferPower, type PowerAllocation, type PresetAllocations } from "../ranking/power.js";
import { COMPARISON_AXES, type Candidate, type CatalogScope, type ComparisonAxis, type Preset } from "../routes/types.js";
import { formatCost, formatProvider, formatSmart, formatTime, padStartToWidth, padToWidth, timeUnit, type TimeUnit } from "./format.js";
import { createMetricScale, renderMicrobar, type MetricScale } from "./metric-scale.js";

const POWER_BAR_WIDTH = 6;
const WIDE_METRIC_WIDTH = 12;
const AXIS_NAMES: Record<ComparisonAxis, string> = { smart: "Smart", fast: "Time", cheap: "Cost" };
const AXIS_KEYS: Record<ComparisonAxis, string> = { smart: "s", fast: "t", cheap: "c" };

interface DisplayFormats {
  timeUnit: TimeUnit;
  metricScale: MetricScale;
  metricBarWidth: number;
}

interface PickerState {
  preset: Preset;
  scope: CatalogScope;
  showDominated: boolean;
  debugMode: boolean;
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
  initialDebugMode?: boolean;
  initialQuery?: string;
  getCandidates: (
    preset: Preset,
    scope: CatalogScope,
    axes: readonly ComparisonAxis[],
    allocation: PowerAllocation,
    showDominated: boolean,
  ) => Candidate[];
  availableHeight?: () => number;
  done: (result: PickerResult) => void;
}

export class ModelPicker implements Component {
  private readonly theme: Theme;
  private readonly getCandidates: PickerOptions["getCandidates"];
  private readonly availableHeight: () => number;
  private readonly presets: readonly Preset[];
  private readonly allocations: PresetAllocations;
  private readonly defaultAllocations: PresetAllocations;
  private readonly onAllocationChange: PickerOptions["onAllocationChange"];
  private readonly onSaveDefault: PickerOptions["onSaveDefault"];
  private readonly done: PickerOptions["done"];
  private preset: Preset;
  private scope: CatalogScope;
  private showDominated: boolean;
  private debugMode: boolean;
  private query: string;
  private searching = false;
  private powerTarget: ComparisonAxis | undefined;
  private selected = 0;

  constructor(options: PickerOptions) {
    this.theme = options.theme;
    this.getCandidates = options.getCandidates;
    this.availableHeight = options.availableHeight ?? (() => 24);
    this.presets = options.presets;
    this.allocations = options.allocations;
    this.defaultAllocations = options.defaultAllocations;
    this.onAllocationChange = options.onAllocationChange;
    this.onSaveDefault = options.onSaveDefault;
    this.done = options.done;
    this.preset = options.initialPreset ?? this.presets[0]!;
    this.scope = options.initialScope ?? "available";
    this.showDominated = options.initialShowDominated ?? false;
    this.debugMode = options.initialDebugMode ?? false;
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
      debugMode: this.debugMode,
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
    this.powerTarget = undefined;
    this.selected = 0;
  }

  private applyAllocation(allocation: PowerAllocation): void {
    this.allocations[this.preset] = allocation;
    this.onAllocationChange(this.preset, allocation);
    this.selected = 0;
  }

  private handlePowerAxis(axis: ComparisonAxis): void {
    const target = this.powerTarget;
    if (!target) {
      this.powerTarget = axis;
      return;
    }
    if (axis === target) {
      this.powerTarget = undefined;
      return;
    }
    const current = this.allocation();
    const allocation = transferPower(current, axis, target);
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
      if (matchesKey(data, Key.escape)) {
        if (this.powerTarget) {
          this.powerTarget = undefined;
          return;
        }
        return this.done(null);
      }
      if (data === "/") {
        this.searching = true;
        return;
      }
      if (data === "u") return this.done({ type: "subscriptions", ...this.state() });
      if (data === "s") return this.handlePowerAxis("smart");
      if (data === "t") return this.handlePowerAxis("fast");
      if (data === "c") return this.handlePowerAxis("cheap");
      if (data === "r") return this.resetPower();
      if (data === "p") return this.savePower();
      if (data === "d") {
        this.showDominated = !this.showDominated;
        this.selected = 0;
        return;
      }
      if (data === "D") {
        this.debugMode = !this.debugMode;
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
    return `Preset: ${active} · ${labels.join(" | ")}`;
  }

  private allocationLine(): string {
    const allocation = this.allocation();
    const codeDefaults = DEFAULT_PRESETS[this.preset]?.allocation;
    const label = (axis: ComparisonAxis, name: string) => {
      if (this.debugMode) {
        const modified = codeDefaults && allocation[axis] !== codeDefaults[axis] ? "*" : "";
        return `${this.theme.fg("accent", this.theme.bold(name))} ${allocation[axis]}${modified}`;
      }
      const bar = renderMicrobar(allocation[axis] / TOTAL_POWER, POWER_BAR_WIDTH);
      const content = allocation[axis] === 0
        ? this.theme.fg("dim", `${name} ${bar}`)
        : `${this.theme.fg("accent", this.theme.bold(name))} ${bar}`;
      return padToWidth(content, name.length + 1 + POWER_BAR_WIDTH);
    };
    const allocationDisplay = `${label("smart", "Smart")}  ${label("fast", "Time")}  ${label("cheap", "Cost")}`.trimEnd();
    if (!this.powerTarget) return allocationDisplay;
    const donors = COMPARISON_AXES
      .filter((axis) => axis !== this.powerTarget)
      .map((axis) => `${AXIS_KEYS[axis]} ${AXIS_NAMES[axis]}`)
      .join(" / ");
    return `${allocationDisplay}  Donor: ${donors} → ${AXIS_NAMES[this.powerTarget]}`;
  }

  private powerHelp(): string {
    const modified = this.isModified() ? "*" : "";
    if (!this.powerTarget) return `power${modified}: s/t/c target · tab preset · r reset · p save`;
    const donors = COMPARISON_AXES
      .filter((axis) => axis !== this.powerTarget)
      .map((axis) => AXIS_KEYS[axis])
      .join("/");
    return `donor: ${donors} → ${AXIS_NAMES[this.powerTarget]} · ${AXIS_KEYS[this.powerTarget]}/esc done`;
  }

  private topLines(): string[] {
    return [this.presetLine(), this.allocationLine()];
  }

  private searchLine(): string {
    if (this.searching) return `Search: ${this.theme.fg("accent", `/${this.query}▏`)}`;
    return this.theme.fg("dim", "Search: / to type");
  }

  private label(text: string, candidate: Candidate, selected: boolean): string {
    if (selected) return this.theme.fg("accent", text);
    return !candidate.selectable || candidate.dominatedBy ? this.theme.fg("dim", text) : text;
  }

  private axisHeader(axis: ComparisonAxis, text: string, width: number): string {
    const header = padToWidth(text, width);
    return this.allocation()[axis] > 0 ? header : this.theme.fg("dim", header);
  }

  private metric(
    axis: ComparisonAxis,
    value: number,
    text: string,
    candidate: Candidate,
    selected: boolean,
    formats: DisplayFormats,
  ): string {
    const indicator = this.debugMode && formats.metricBarWidth > 1
      ? (candidate.ranking?.contributions[axis].toFixed(2) ?? "—".repeat(formats.metricBarWidth))
      : formats.metricScale.bar(axis, value, formats.metricBarWidth);
    return this.label(`${text} ${indicator}`, candidate, selected);
  }

  private costText(candidate: Candidate): string {
    const referenceCost = formatCost(candidate.variant.metrics.cheap);
    return `${referenceCost}${candidate.included ? " ·incl" : ""}`;
  }

  private providerText(candidate: Candidate): string {
    if (this.debugMode) return candidate.ranking?.worstRegret.toFixed(3) ?? "—";
    const provider = formatProvider(candidate.providerLabel);
    if (candidate.dominatedBy) return `← ${candidate.dominatedBy.variant.displayName} · ${provider}`;
    return provider;
  }

  private wideRow(candidate: Candidate, selected: boolean, width: number, formats: DisplayFormats): string {
    const smartWidth = WIDE_METRIC_WIDTH;
    const timeWidth = WIDE_METRIC_WIDTH;
    const costWidth = WIDE_METRIC_WIDTH;
    const providerWidth = Math.min(20, Math.max(12, Math.floor(width * 0.15)));
    const modelWidth = Math.max(16, width - smartWidth - timeWidth - costWidth - providerWidth - 6);
    const prefix = this.label(selected ? "› " : "  ", candidate, selected);
    const current = candidate.current ? " ✓" : "";
    const model = this.label(padToWidth(`${candidate.variant.displayName}${current}`, modelWidth, "…"), candidate, selected);
    const metricPadding = formats.metricBarWidth + 1;
    const smartText = padStartToWidth(formatSmart(candidate.variant.metrics.smart), smartWidth - metricPadding);
    const smart = this.metric("smart", candidate.variant.metrics.smart, smartText, candidate, selected, formats);
    const timeText = padStartToWidth(formatTime(candidate.variant.metrics.fast, formats.timeUnit), timeWidth - metricPadding);
    const time = this.metric("fast", candidate.variant.metrics.fast, timeText, candidate, selected, formats);
    const cost = candidate.included && !this.debugMode
      ? this.label(padStartToWidth(this.costText(candidate), costWidth), candidate, selected)
      : this.metric(
        "cheap",
        candidate.effectiveCost,
        padStartToWidth(this.costText(candidate), costWidth - metricPadding),
        candidate,
        selected,
        formats,
      );
    const provider = this.label(padToWidth(this.providerText(candidate), providerWidth, "…"), candidate, selected);
    return truncateToWidth(`${prefix}${model} ${smart} ${time} ${cost} ${provider}`, width, "");
  }

  private narrowColumns(width: number): Array<{ header: string; width: number }> {
    if (width >= 50) return [
      { header: "Smart", width: 7 },
      { header: "Time", width: 8 },
      { header: "Cost", width: 14 },
    ];
    if (width >= 35) return [
      { header: "Smart", width: 7 },
      { header: "Time", width: 8 },
    ];
    if (width >= 25) return [{ header: "Smart", width: 7 }];
    return [];
  }

  private narrowRow(candidate: Candidate, selected: boolean, width: number, formats: DisplayFormats): string {
    const columns = this.narrowColumns(width);
    const columnWidth = columns.reduce((sum, column) => sum + column.width, 0) + columns.length;
    const modelWidth = Math.max(1, width - columnWidth - 2);
    const prefix = this.label(selected ? "› " : "  ", candidate, selected);
    const current = candidate.current ? " ✓" : "";
    const model = this.label(padToWidth(`${candidate.variant.displayName}${current}`, modelWidth, "…"), candidate, selected);
    const values = columns.map(({ header, width: columnWidth }) => {
      if (header === "Smart") {
        const text = padStartToWidth(formatSmart(candidate.variant.metrics.smart), columnWidth - 2);
        return this.metric("smart", candidate.variant.metrics.smart, text, candidate, selected, formats);
      }
      if (header === "Time") {
        const text = padStartToWidth(formatTime(candidate.variant.metrics.fast, formats.timeUnit), columnWidth - 2);
        return this.metric("fast", candidate.variant.metrics.fast, text, candidate, selected, formats);
      }
      const text = padStartToWidth(this.costText(candidate), columnWidth - 2);
      return this.metric("cheap", candidate.effectiveCost, text, candidate, selected, formats);
    });
    return `${prefix}${model}${values.map((value) => ` ${value}`).join("")}`;
  }

  render(width: number): string[] {
    const candidates = this.candidates();
    if (this.selected >= candidates.length) this.selected = Math.max(0, candidates.length - 1);
    const topLines = this.topLines();
    const rowHeight = 1;
    const hasDominated = candidates.some((candidate) => candidate.dominatedBy);
    const fixedLines = topLines.length + 7 + (hasDominated ? 1 : 0);
    const pageSize = Math.max(1, Math.floor((this.availableHeight() - fixedLines) / rowHeight));
    const pageStart = Math.floor(this.selected / pageSize) * pageSize;
    const page = candidates.slice(pageStart, pageStart + pageSize);
    const formats: DisplayFormats = {
      timeUnit: timeUnit(candidates.map((candidate) => candidate.variant.metrics.fast)),
      metricScale: createMetricScale(candidates.map((candidate) => ({
        smart: candidate.variant.metrics.smart,
        fast: candidate.variant.metrics.fast,
        cheap: candidate.effectiveCost,
      }))),
      metricBarWidth: width >= 80 ? 4 : 1,
    };
    const lines = [
      ...topLines.map((line) => truncateToWidth(line, width, "")),
      "",
    ];
    const separatorBefore = (index: number) => {
      const candidate = candidates[index];
      const previous = candidates[index - 1];
      if (candidate?.dominatedBy && previous && !previous.dominatedBy) {
        lines.push(this.theme.fg("dim", "─".repeat(width)));
      }
    };

    if (width >= 80) {
      const smartWidth = WIDE_METRIC_WIDTH;
      const timeWidth = WIDE_METRIC_WIDTH;
      const costWidth = WIDE_METRIC_WIDTH;
      const providerWidth = Math.min(20, Math.max(12, Math.floor(width * 0.15)));
      const modelWidth = Math.max(16, width - smartWidth - timeWidth - costWidth - providerWidth - 6);
      lines.push(truncateToWidth(
        padToWidth("Model variant", modelWidth + 2)
          + " " + this.axisHeader("smart", "Smart", smartWidth)
          + " " + this.axisHeader("fast", "Time", timeWidth)
          + " " + this.axisHeader("cheap", "Cost", costWidth)
          + " " + padToWidth(this.debugMode ? "Worst" : "Provider", providerWidth),
        width,
        "",
      ));
      for (const [index, candidate] of page.entries()) {
        separatorBefore(pageStart + index);
        lines.push(this.wideRow(candidate, pageStart + index === this.selected, width, formats));
      }
    } else {
      const columns = this.narrowColumns(width);
      const columnWidth = columns.reduce((sum, column) => sum + column.width, 0) + columns.length;
      const modelWidth = Math.max(1, width - columnWidth);
      lines.push(padToWidth("Model variant", modelWidth, "…")
        + columns.map((column) => ` ${padToWidth(column.header, column.width)}`).join(""));
      for (const [index, candidate] of page.entries()) {
        separatorBefore(pageStart + index);
        lines.push(this.narrowRow(candidate, pageStart + index === this.selected, width, formats));
      }
    }

    const end = Math.min(pageStart + pageSize, candidates.length);
    lines.push("");
    lines.push(truncateToWidth(
      `${candidates.length === 0 ? "0" : `${pageStart + 1}–${end}`} of ${candidates.length} · ${this.scope === "available" ? "available models" : "all models"}${this.showDominated ? " · dominated shown" : ""}`,
      width,
      "",
    ));
    lines.push(truncateToWidth(this.searchLine(), width, ""));
    lines.push(truncateToWidth(this.powerHelp(), width, ""));
    lines.push(truncateToWidth("/ search · d dominated · a all · u subs", width, ""));
    return lines;
  }
}
