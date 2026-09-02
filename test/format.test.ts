import { describe, expect, it } from "vitest";
import { formatCost, formatProvider, formatTime, timeUnit } from "../src/ui/format.js";

describe("comparable metric formatting", () => {
  it("chooses one time unit from the column maximum", () => {
    const unit = timeUnit([58, 66]);
    expect(formatTime(58, unit)).toBe("1.0m");
    expect(formatTime(66, unit)).toBe("1.1m");
  });

  it("rounds costs to thousandths", () => {
    expect(formatCost(0.0042)).toBe("$0.004");
    expect(formatCost(12)).toBe("$12.000");
    expect(formatCost(1.2356)).toBe("$1.236");
  });

  it("abbreviates each provider when several share a variant", () => {
    expect(formatProvider("baseten, huggingface")).toBe("bas, hug");
    expect(formatProvider("openai-codex")).toBe("openai-codex");
  });
});
