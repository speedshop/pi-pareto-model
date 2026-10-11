import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../visualization/preset-map.template.html", import.meta.url), "utf8");
const colorCode = template.slice(template.indexOf("    const palette ="), template.indexOf("    function compactQualifier"));
const colors = runInNewContext(`${colorCode}\nmodelColors;`) as (name: string) => [string, string];
const rgb = (color: string) => color.match(/\d+/g)!.map(Number);

describe("visualization colors", () => {
  it("darkens the same family progressively with thinking effort", () => {
    const levels = ["Non-reasoning", "low", "medium", "high", "xhigh", "max"];
    const shades = levels.map((level) => rgb(colors(`GPT-6 Astra (${level})`)[0]));
    for (let index = 1; index < shades.length; index++) {
      shades[index]!.forEach((channel, axis) => expect(channel).toBeLessThan(shades[index - 1]![axis]!));
    }
    expect(colors("GPT-6 Astra (high)")).toEqual(colors("GPT-6 Astra"));
  });

  it("recognizes adaptive reasoning effort qualifiers", () => {
    expect(colors("Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)"))
      .toEqual(colors("Claude Fable 5.1 (max)"));
  });

  it("preserves non-thinking qualifiers as part of the family", () => {
    expect(colors("GPT-5.5 Instant (June 2026)"))
      .not.toEqual(colors("GPT-5.5 Instant"));
  });

  it("uses readable text contrast at every level", () => {
    for (const level of ["Non-reasoning", "low", "medium", "high", "xhigh", "max"]) {
      const [background, ink] = colors(`GPT-6 Astra (${level})`);
      const channels = rgb(background).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
      const contrast = ink === "#ffffff" ? 1.05 / (luminance + 0.05) : (luminance + 0.05) / 0.05;
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });
});
