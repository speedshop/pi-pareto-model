import { describe, expect, it } from "vitest";
import { DEFAULT_PRESETS, enabledAxes, isPowerAllocation, TOTAL_POWER, transferPower } from "../src/ranking/power.js";

function total(allocation: Record<string, number>): number {
  return Object.values(allocation).reduce((sum, value) => sum + value, 0);
}

describe("power allocation", () => {
  it("gives every Preset the fixed power budget", () => {
    for (const preset of Object.values(DEFAULT_PRESETS)) expect(total(preset.allocation)).toBe(TOTAL_POWER);
  });

  it("uses the configured fractional Fast allocation", () => {
    expect(DEFAULT_PRESETS.fast!.allocation).toEqual({ smart: 5, fast: 5.25, cheap: 1.75 });
  });

  it("uses the configured Smart allocation", () => {
    expect(DEFAULT_PRESETS.smart!.allocation).toEqual({ smart: 8, fast: 2.25, cheap: 1.75 });
  });

  it("uses the configured Cheap allocation", () => {
    expect(DEFAULT_PRESETS.cheap!.allocation).toEqual({ smart: 1.25, fast: 1, cheap: 9.75 });
  });

  it("routes one quarter-power at a time without changing the total", () => {
    const before = DEFAULT_PRESETS.overall!.allocation;
    const after = transferPower(before, "fast", "smart");
    expect(after).toEqual({ smart: 6.5, fast: 4, cheap: 1.5 });
    expect(total(after)).toBe(TOTAL_POWER);
    expect(before).toEqual({ smart: 6.25, fast: 4.25, cheap: 1.5 });
  });

  it("accepts quarter-power allocations", () => {
    expect(isPowerAllocation({ smart: 6.25, fast: 3.75, cheap: 2 })).toBe(true);
    expect(isPowerAllocation({ smart: 6.1, fast: 3.9, cheap: 2 })).toBe(false);
  });

  it("can reduce axes to zero by routing all their power", () => {
    let allocation = DEFAULT_PRESETS.overall!.allocation;
    for (let index = 0; index < 25; index += 1) allocation = transferPower(allocation, "smart", "cheap");
    for (let index = 0; index < 17; index += 1) allocation = transferPower(allocation, "fast", "cheap");
    expect(allocation).toEqual({ smart: 0, fast: 0, cheap: 12 });
    expect(enabledAxes(allocation)).toEqual(["cheap"]);
  });
});
