import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";

export class SubscriptionPicker implements Component {
  private readonly providers: string[];
  private readonly theme: Theme;
  private readonly done: (disabled: Set<string> | null) => void;
  private readonly disabled: Set<string>;
  private selected = 0;

  constructor(providers: string[], disabled: ReadonlySet<string>, theme: Theme, done: (disabled: Set<string> | null) => void) {
    this.providers = providers;
    this.disabled = new Set(disabled);
    this.theme = theme;
    this.done = done;
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) return this.done(null);
    if (matchesKey(data, Key.up)) this.selected = Math.max(0, this.selected - 1);
    if (matchesKey(data, Key.down)) this.selected = Math.min(Math.max(0, this.providers.length - 1), this.selected + 1);
    if (matchesKey(data, Key.space)) {
      const provider = this.providers[this.selected];
      if (provider) {
        if (this.disabled.has(provider)) this.disabled.delete(provider);
        else this.disabled.add(provider);
      }
    }
    if (matchesKey(data, Key.enter)) this.done(new Set(this.disabled));
  }

  render(width: number): string[] {
    const lines = [this.theme.fg("accent", this.theme.bold("Subscriptions")), ""];
    if (this.providers.length === 0) lines.push(this.theme.fg("dim", "No authenticated subscriptions detected."));
    for (const [index, provider] of this.providers.entries()) {
      const line = `${index === this.selected ? "›" : " "} [${this.disabled.has(provider) ? " " : "x"}] ${provider}`;
      lines.push(index === this.selected ? this.theme.fg("accent", line) : line);
    }
    lines.push("", this.theme.fg("dim", "↑↓ select · space toggle · enter save · esc cancel"));
    return lines.map((line) => truncateToWidth(line, width, ""));
  }
}
