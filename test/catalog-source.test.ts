import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredPresets, interpolateEnvironment, saveConfiguredAllocation } from "../src/catalog/config.js";
import { DEFAULT_PRESETS } from "../src/ranking/power.js";
import { loadCatalog } from "../src/catalog/load.js";

const fixturePath = new URL("./fixtures/model-selection-catalog.json", import.meta.url).pathname;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("catalog sources", () => {
  it("loads a local file", async () => {
    const catalog = await loadCatalog({ type: "file", path: fixturePath });
    expect(catalog.catalog.id).toBe("fixture-random-model-index");
  });

  it("interpolates environment variables without exposing config secrets", () => {
    expect(interpolateEnvironment("Bearer $TOKEN", { TOKEN: "secret" })).toBe("Bearer secret");
    expect(() => interpolateEnvironment("$MISSING", {})).toThrow("MISSING");
  });

  it("replaces built-in Presets with configured Presets", () => {
    const presets = configuredPresets({
      source: { type: "file", path: fixturePath },
      presets: {
        advisor: { smart: 12, time: 0, cost: 0 },
        planner: { smart: 6, time: 6, cost: 0, subscriptionRoutes: "only", paretoCost: "reference" },
      },
    });
    expect(Object.keys(presets)).toEqual(["advisor", "planner"]);
    expect(presets.advisor).toEqual({
      allocation: { smart: 12, fast: 0, cheap: 0 },
      subscriptionRoutes: "compete",
      paretoCost: "effective",
    });
    expect(presets.planner?.subscriptionRoutes).toBe("only");
  });

  it("saves one Preset allocation without changing the catalog source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pareto-config-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "pareto-model-picker.json");
    await writeFile(path, JSON.stringify({ source: { type: "file", path: "catalog.json" } }));
    await saveConfiguredAllocation(path, "overall", { smart: 5, fast: 4, cheap: 3 }, DEFAULT_PRESETS);
    const saved = JSON.parse(await readFile(path, "utf8"));
    expect(saved.source.path).toBe("catalog.json");
    expect(saved.presets.overall).toMatchObject({ smart: 5, time: 4, cost: 3 });
  });

  it("caches HTTP responses and falls back after a fetch failure", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "pareto-catalog-"));
    temporaryDirectories.push(cacheDir);
    const body = await readFile(fixturePath, "utf8");
    const successfulFetch = vi.fn(async () => new Response(body, { status: 200, headers: { etag: "fixture-v1" } }));
    const source = { type: "http" as const, url: "https://example.invalid/catalog.json" };

    const first = await loadCatalog(source, { fetch: successfulFetch as typeof fetch, cacheDir, ttlHours: 0 });
    expect(first.variants).toHaveLength(14);

    const failedFetch = vi.fn(async () => { throw new Error("offline"); });
    const cached = await loadCatalog(source, { fetch: failedFetch as typeof fetch, cacheDir, ttlHours: 0 });
    expect(cached.catalog.id).toBe(first.catalog.id);
  });
});
