import { describe, expect, it } from "vitest";
import { enabledAxes, isPowerAllocation } from "../src/ranking.js";

describe("power allocation", () => {
  it("accepts quarter-power allocations", () => {
    expect(isPowerAllocation({ smart: 6.25, fast: 3.75, cheap: 2 })).toBe(true);
    expect(isPowerAllocation({ smart: 6.1, fast: 3.9, cheap: 2 })).toBe(false);
  });

  it("enables only axes with power", () => {
    expect(enabledAxes({ smart: 0, fast: 0, cheap: 12 })).toEqual(["cheap"]);
  });
});
