import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateCatalog } from "../src/catalog/validate.js";

async function fixture(): Promise<any> {
  return JSON.parse(await readFile(new URL("./fixtures/model-selection-catalog.json", import.meta.url), "utf8"));
}

describe("catalog validation", () => {
  it("accepts source origins for every metric", async () => {
    const value = await fixture();
    value.variants[0].metricOrigins = {
      smart: { kind: "source", benchmarkVersion: "smart-v1" },
      fast: { kind: "source", benchmarkVersion: "fast-v1" },
      cheap: { kind: "source", benchmarkVersion: "cheap-v1" },
    };

    const catalog = await validateCatalog(value);
    expect(catalog.variants).toHaveLength(14);
    expect(catalog.variants[0]?.metricOrigins.smart.kind).toBe("source");
  });

  it("accepts adjusted origins for Fast and Cheap", async () => {
    const value = await fixture();
    const catalog = await validateCatalog(value);

    expect(catalog.variants[0]?.metricOrigins.cheap).toMatchObject({
      kind: "adjusted",
      method: "median-overlap-ratio",
      factor: 1.25,
    });
    expect(catalog.variants[1]?.metricOrigins.fast.kind).toBe("adjusted");
  });

  it.each([2, "1.1"])("rejects unsupported schema version %j", async (schemaVersion) => {
    const value = await fixture();
    value.schemaVersion = schemaVersion;
    await expect(validateCatalog(value)).rejects.toThrow("schemaVersion");
  });

  it.each([
    ["a missing origin", (value: any) => { delete value.variants[0].metricOrigins.fast; }],
    ["an adjusted Smart origin", (value: any) => {
      value.variants[0].metricOrigins.smart = {
        kind: "adjusted",
        benchmarkVersion: "smart-v1",
        sourceBenchmarkVersion: "smart-v0",
        method: "median-overlap-ratio",
        factor: 1,
      };
    }],
    ["an incomplete adjusted origin", (value: any) => {
      delete value.variants[0].metricOrigins.cheap.sourceBenchmarkVersion;
    }],
    ["an unknown adjustment method", (value: any) => {
      value.variants[0].metricOrigins.cheap.method = "arithmetic-mean";
    }],
    ["a non-positive adjustment factor", (value: any) => {
      value.variants[0].metricOrigins.cheap.factor = 0;
    }],
  ])("rejects %s", async (_description, mutate) => {
    const value = await fixture();
    mutate(value);
    await expect(validateCatalog(value)).rejects.toThrow("Invalid model-selection catalog");
  });

  it("rejects zero Reference Task Time because ranking uses a logarithmic scale", async () => {
    const value = await fixture();
    value.variants[0].metrics.fast = 0;
    await expect(validateCatalog(value)).rejects.toThrow("fast");
  });

  it("rejects duplicate variant ids", async () => {
    const value = await fixture();
    value.variants.push(value.variants[0]);
    await expect(validateCatalog(value)).rejects.toThrow("duplicate variant id");
  });
});
