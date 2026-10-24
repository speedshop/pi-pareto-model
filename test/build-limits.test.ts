import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkPageSize, MAX_BUILD_TIME_MS, MAX_GZIP_BYTES, runBuild } from "../src/build-limits.js";

const directories: string[] = [];
const temporaryDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), "pareto-build-limits-"));
  directories.push(directory);
  return directory;
};

function incompressibleText(bytes: number) {
  const buffer = Buffer.alloc(bytes);
  let state = 0x12345678;
  for (let index = 0; index < bytes; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    buffer[index] = state & 255;
  }
  return buffer.toString("base64");
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("hard build limits", () => {
  it("caps builds at ten minutes and combined gzip payloads at one decimal MB", () => {
    expect(MAX_BUILD_TIME_MS).toBe(600_000);
    expect(MAX_GZIP_BYTES).toBe(1_000_000);
    expect(() => checkPageSize("a".repeat(2_000_000))).not.toThrow();
    expect(() => checkPageSize(incompressibleText(1_100_000))).toThrow(/1 MB, gzip/);
  });

  it("rejects HTML plus JSON that together exceed the limit even when each file fits", () => {
    const html = incompressibleText(550_000);
    const json = JSON.stringify({ data: incompressibleText(550_000) });
    expect(() => checkPageSize(html)).not.toThrow();
    expect(() => checkPageSize(json)).not.toThrow();
    expect(() => checkPageSize(html, json)).toThrow(/Combined page payload/);
  });

  it.each([
    ["CPU-bound", "while (true) {}"],
    ["waiting for I/O", "setInterval(() => {}, 1000);"],
    ["blocked in a subprocess", 'import { spawnSync } from "node:child_process"; spawnSync(process.execPath, ["-e", "while (true) {}"]);'],
  ])("terminates a build %s when its deadline expires", async (_name, source) => {
    const script = join(temporaryDirectory(), "stalled.mjs");
    writeFileSync(script, source);
    const started = performance.now();
    await expect(runBuild(pathToFileURL(script), { argv: [], timeoutMs: 250 }))
      .rejects.toThrow(/time limit and was terminated/);
    expect(performance.now() - started).toBeLessThan(5_000);
  });

  it("propagates subprocess failures", async () => {
    const script = join(temporaryDirectory(), "failed.mjs");
    writeFileSync(script, "process.exit(2);");
    await expect(runBuild(pathToFileURL(script), { argv: [] })).rejects.toThrow(/exited with code 2/);
  });

  it("rejects oversized CLI output before writing HTML, JSON, or exported snapshots", () => {
    const directory = temporaryDirectory();
    const template = join(directory, "oversized.html");
    const output = join(directory, "page.html");
    const json = join(directory, "page.data.json");
    const snapshot = join(directory, "rankings.json");
    const source = new URL("../visualization/preset-map.template.html", import.meta.url);
    writeFileSync(template, readFileSync(source, "utf8") + incompressibleText(1_100_000));
    writeFileSync(output, "existing page");
    writeFileSync(json, "existing data");
    writeFileSync(snapshot, "existing snapshot");
    const result = spawnSync(process.execPath, [
      new URL("../scripts/build-preset-map.mjs", import.meta.url).pathname,
      "--catalog", new URL("./fixtures/model-selection-catalog.json", import.meta.url).pathname,
      "--derived", "--export-rankings", snapshot, "--template", template, "--output", output,
    ], { encoding: "utf8", timeout: 10_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("maximum is 1,000,000 bytes (1 MB, gzip)");
    expect(readFileSync(output, "utf8")).toBe("existing page");
    expect(readFileSync(json, "utf8")).toBe("existing data");
    expect(readFileSync(snapshot, "utf8")).toBe("existing snapshot");
  });
});
