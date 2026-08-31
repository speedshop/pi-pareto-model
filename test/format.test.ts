import { describe, expect, it } from "vitest";
import { costPrecision, formatCost, formatTime, timeUnit } from "../src/ui/format.js";

describe("comparable metric formatting", () => {
  it("chooses one time unit from the column maximum", () => {
    const unit = timeUnit([58, 66]);
    expect(formatTime(58, unit)).toBe("1.0m");
    expect(formatTime(66, unit)).toBe("1.1m");
  });

  it("chooses fixed cost precision from the smallest positive value", () => {
    const precision = costPrecision([0, 0.0042, 12]);
    expect(formatCost(0.0042, precision)).toBe("$0.0042");
    expect(formatCost(12, precision)).toBe("$12.0000");
  });
});
