import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type Model = { name: string; creator: string; reasoning?: string; color?: string; ink?: string };

const template = readFileSync(new URL("../visualization/preset-map.template.html", import.meta.url), "utf8");
const colorCode = template.slice(template.indexOf("    const CREATOR_HUES ="), template.indexOf("    function compactQualifier"));
const assignModelColors = runInNewContext(`${colorCode}\nassignModelColors;`) as (models: Model[]) => void;
const rgb = (color: string) => color.match(/\d+/g)!.map(Number);
const luminance = (color: string) => rgb(color).map((channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);

function colored(models: Model[]): Model[] {
  assignModelColors(models);
  return models;
}

describe("visualization colors", () => {
  it("darkens the same family progressively with thinking effort", () => {
    const levels = ["Off", "minimal", "low", "medium", "high", "xhigh", "max"];
    const models = colored(levels.map((level) => ({ name: `GPT-6 Astra (${level})`, creator: "OpenAI", reasoning: level })));
    for (let index = 1; index < models.length; index++) {
      expect(luminance(models[index]!.color!)).toBeLessThan(luminance(models[index - 1]!.color!));
    }
    const [off, on] = colored([
      { name: "Qwen3.5 9B (Non-reasoning)", creator: "Alibaba", reasoning: "Off" },
      { name: "Qwen3.5 9B (Reasoning)", creator: "Alibaba", reasoning: "Reasoning" },
    ]);
    expect(luminance(on!.color!)).toBeLessThan(luminance(off!.color!));
  });

  it("recognizes adaptive reasoning effort qualifiers", () => {
    const [adaptive, max] = colored([
      { name: "Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)", creator: "Anthropic" },
      { name: "Claude Fable 5.1 (max)", creator: "Anthropic" },
    ]);
    expect(adaptive!.color).toEqual(max!.color);
  });

  it("preserves non-thinking qualifiers as part of the family", () => {
    const [dated, plain] = colored([
      { name: "GPT-5.5 Instant (June 2026)", creator: "OpenAI" },
      { name: "GPT-5.5 Instant", creator: "OpenAI" },
    ]);
    expect(dated!.color).not.toEqual(plain!.color);
  });

  it("uses readable text contrast at every level", () => {
    const levels = ["Off", "low", "medium", "high", "xhigh", "max", "Reasoning"];
    const creators = ["OpenAI", "Anthropic", "Google", "Unlisted Lab"];
    const models = colored(creators.flatMap((creator) =>
      levels.map((level) => ({ name: `Model (${level})`, creator, reasoning: level }))));
    for (const { color, ink } of models) {
      const value = luminance(color!);
      const contrast = ink === "#ffffff" ? 1.05 / (value + 0.05) : (value + 0.05) / 0.05;
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  });
});
