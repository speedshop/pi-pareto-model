import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateCatalog } from "../src/catalog/validate.js";

describe("catalog validation", () => {
  it("accepts the fabricated fixture", async () => {
    const fixture = JSON.parse(await readFile(new URL("./fixtures/model-selection-catalog.json", import.meta.url), "utf8"));
    const catalog = await validateCatalog(fixture);
    expect(catalog.variants).toHaveLength(14);
  });

  it("rejects unsupported schema versions", async () => {
    const fixture = JSON.parse(await readFile(new URL("./fixtures/model-selection-catalog.json", import.meta.url), "utf8"));
    fixture.schemaVersion = 2;
    await expect(validateCatalog(fixture)).rejects.toThrow("schemaVersion");
  });

  it("rejects duplicate variant ids", async () => {
    const fixture = JSON.parse(await readFile(new URL("./fixtures/model-selection-catalog.json", import.meta.url), "utf8"));
    fixture.variants.push(fixture.variants[0]);
    await expect(validateCatalog(fixture)).rejects.toThrow("duplicate variant id");
  });
});
