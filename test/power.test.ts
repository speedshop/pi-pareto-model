import { describe, expect, it } from "vitest";
import { DEFAULT_PRESETS, enabledAxes, routePower, TOTAL_POWER } from "../src/ranking/power.js";

function total(allocation: Record<string, number>): number {
  return Object.values(allocation).reduce((sum, value) => sum + value, 0);
}

describe("power allocation", () => {
  it("gives every Preset the fixed power budget", () => {
    for (const preset of Object.values(DEFAULT_PRESETS)) expect(total(preset.allocation)).toBe(TOTAL_POWER);
  });

  it("routes one unit at a time without changing the total", () => {
    const before = DEFAULT_PRESETS.overall!.allocation;
    const after = routePower(before, "smart");
    expect(after).toEqual({ smart: 7, fast: 2, cheap: 3 });
    expect(total(after)).toBe(TOTAL_POWER);
    expect(before).toEqual({ smart: 6, fast: 3, cheap: 3 });
  });

  it("can reduce axes to zero in nine routing steps", () => {
    let allocation = DEFAULT_PRESETS.overall!.allocation;
    for (let index = 0; index < 9; index += 1) allocation = routePower(allocation, "cheap");
    expect(allocation).toEqual({ smart: 0, fast: 0, cheap: 12 });
    expect(enabledAxes(allocation)).toEqual(["cheap"]);
  });
});
