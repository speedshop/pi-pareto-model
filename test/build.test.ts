import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/model-selection-catalog.json" with { type: "json" };

describe("preset map build", () => {
  it("inlines the UI code and fetches model data from a sibling JSON file", () => {
    const output = join(mkdtempSync(join(tmpdir(), "preset-map-")), "preset-map.html");
    const script = new URL("../scripts/build-preset-map.mjs", import.meta.url).pathname;
    const catalog = new URL("./fixtures/model-selection-catalog.json", import.meta.url).pathname;
    execFileSync(process.execPath, [script, "--catalog", catalog, "--output", output], { stdio: "pipe" });
    const html = readFileSync(output, "utf8");

    expect(html).not.toContain("__PRESET_MAP_DATA_URL__");
    expect(html).not.toContain("__RANKING_MODULE__");
    expect(html).not.toContain("__STRINGS__");
    expect(html).toContain("function rankVariants(");
    expect(html).not.toMatch(/^export /m);
    expect(html).toContain('const mapData = await loadMapData("preset-map.data.json");');
    expect(html).not.toContain(fixture.variants[0]!.id);
    const data = JSON.parse(readFileSync(join(output, "..", "preset-map.data.json"), "utf8"));
    expect(data.variants).toHaveLength(fixture.variants.length);
  });
});
