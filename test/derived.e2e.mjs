import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadDerivedRankings } from "../src/derived-rankings.js";
import { AXES, paretoFront, rankVariants } from "../src/ranking.js";

const root = resolve(import.meta.dirname, "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const directory = mkdtempSync(join(root, "tmp", "derived-e2e-"));
const build = join(root, "scripts", "build-preset-map.mjs");
const check = join(root, "scripts", "check-derived-page.mjs");
const run = (script, args) => execFileSync(process.execPath, [script, ...args], { encoding: "utf8", cwd: root });

try {
  const catalog = JSON.parse(readFileSync(join(root, "test", "fixtures", "model-selection-catalog.json"), "utf8"));
  catalog.variants = catalog.variants.slice(0, 4);
  catalog.catalog.name = "Artificial Analysis Intelligence Index";
  catalog.catalog.distribution = {
    classification: "restricted",
    allowRedistribution: false,
    attribution: "Source: Artificial Analysis (artificialanalysis.ai)",
    termsUrl: "https://artificialanalysiscdn.com/legal/ProDataPlatformTerms.pdf",
  };
  catalog.catalog.provenance = { privateMarker: "PRIVATE_SOURCE_PAYLOAD_MUST_NOT_PUBLISH" };
  catalog.variants.forEach((variant, index) => {
    variant.creator = ["Anthropic", "OpenAI"][index % 2];
    variant.metrics = { smart: 25.718392 + index, fast: 42.928371 + index, cheap: 0.008174 + index };
    variant.provenance.privateMarker = "PRIVATE_TRIAL_DETAILS_MUST_NOT_PUBLISH";
  });
  const source = join(directory, "restricted.json");
  const page = join(directory, "derived.html");
  const snapshot = join(directory, "rankings.json");
  writeFileSync(source, JSON.stringify(catalog));
  const denied = spawnSync(process.execPath, [build, "--catalog", source, "--output", page], { encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /does not allow redistribution/);

  run(build, ["--catalog", source, "--derived", "--export-rankings", snapshot, "--output", page]);
  const html = readFileSync(page, "utf8");
  const jsonPath = join(directory, "derived.data.json");
  const json = readFileSync(jsonPath, "utf8");
  const data = await loadDerivedRankings(snapshot);
  assert.match(html, /const mapData = await loadMapData\("derived.data.json"\);/);
  assert.deepEqual(JSON.parse(json), data);
  assert.equal(data.kind, "derived-rankings-v3");
  assert.equal(data.subscriptions.length, 3);
  let changed = false;
  for (let mask = 0; mask < 4; mask += 1) {
    const scenario = mask === 0 ? data : data.subscriptions[mask - 1];
    const variants = catalog.variants.map((variant, index) => ({
      id: variant.id, name: variant.displayName,
      metrics: { ...variant.metrics, cheap: variant.metrics.cheap / ((mask & (1 << (index % 2))) ? 5 : 1) },
    }));
    for (const [key, order] of Object.entries(scenario.orders)) {
      const [smart, fast] = key.split(",").map(Number);
      const allocation = { smart, fast, cheap: 12 - smart - fast };
      const axes = AXES.filter((axis) => allocation[axis] > 0);
      const reference = paretoFront(variants, axes);
      const expected = rankVariants(variants, allocation, axes, reference).map((variant) => variant.id);
      assert.deepEqual(order.map((index) => data.variants[index].id), expected);
      changed ||= JSON.stringify(order) !== JSON.stringify(data.orders[key]);
      const frontier = order.filter((index) => !scenario.dominators[axes.join(",")][index].length);
      assert.deepEqual(frontier.map((index) => data.variants[index].id), rankVariants(reference, allocation, axes, reference).map((variant) => variant.id));
    }
  }
  assert.equal(changed, true, "Subscription costs must change at least one ranking");
  assert.equal(Object.keys(data.orders).length, 1225);
  assert.equal(Object.keys(data.dominators).length, 7);
  for (const order of Object.values(data.orders)) assert.equal(order.length, catalog.variants.length);
  assert.match(html, /document.querySelector\("#show-dominated"\).checked = true/);
  assert.match(html, /Based on data from Artificial Analysis/);
  assert.match(html, /do not represent the views or endorsement/);
  assert.match(html, /M13\.982 16h1\.996/);
  for (const marker of ["PRIVATE_SOURCE_PAYLOAD_MUST_NOT_PUBLISH", "PRIVATE_TRIAL_DETAILS_MUST_NOT_PUBLISH"]) {
    assert.equal(html.includes(marker), false);
    assert.equal(json.includes(marker), false);
    assert.equal(readFileSync(snapshot, "utf8").includes(marker), false);
  }
  for (const variant of catalog.variants) {
    for (const value of [...Object.values(variant.metrics), variant.metrics.cheap / 5]) {
      assert.equal(html.includes(String(value)), false);
      assert.equal(json.includes(String(value)), false);
    }
  }
  run(check, [page]);
  const rebuilt = join(directory, "rebuilt.html");
  run(build, ["--rankings", snapshot, "--output", rebuilt]);
  assert.equal(readFileSync(rebuilt, "utf8"), html.replace('loadMapData("derived.data.json")', 'loadMapData("rebuilt.data.json")'));
  assert.equal(readFileSync(join(directory, "rebuilt.data.json"), "utf8"), json);

  const complete = structuredClone(data);
  delete data.subscriptions;
  data.variants[0].metrics = catalog.variants[0].metrics;
  const unsafe = join(directory, "unsafe.json");
  writeFileSync(unsafe, JSON.stringify(data));
  const rejected = spawnSync(process.execPath, [build, "--rankings", unsafe, "--output", rebuilt], { encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Invalid derived rankings/);
  const tampered = join(directory, "tampered.html");
  writeFileSync(tampered, html.replace('loadMapData("derived.data.json")', 'loadMapData("tampered.data.json")'));
  writeFileSync(join(directory, "tampered.data.json"), JSON.stringify({ ...complete, variants: data.variants }));
  assert.notEqual(spawnSync(process.execPath, [check, tampered]).status, 0);

  delete data.variants[0].metrics;
  data.orders["0,0"][0] = data.variants.length;
  writeFileSync(unsafe, JSON.stringify(data));
  const invalidOrder = spawnSync(process.execPath, [build, "--rankings", unsafe, "--output", rebuilt], { encoding: "utf8" });
  assert.notEqual(invalidOrder.status, 0);
  assert.match(invalidOrder.stderr, /Invalid derived ranking order/);
  data.orders["0,0"] = data.variants.map((_variant, index) => index);
  data.dominators.smart[0] = [0];
  writeFileSync(unsafe, JSON.stringify(data));
  const invalidDominators = spawnSync(process.execPath, [build, "--rankings", unsafe, "--output", rebuilt], { encoding: "utf8" });
  assert.notEqual(invalidDominators.status, 0);
  assert.match(invalidDominators.stderr, /Invalid derived dominators/);
  const damagedScenario = `${snapshot}.subscriptions-3.json`;
  const damaged = JSON.parse(readFileSync(damagedScenario, "utf8"));
  damaged.orders["0,0"].pop();
  writeFileSync(damagedScenario, JSON.stringify(damaged));
  const invalidScenario = spawnSync(process.execPath, [build, "--rankings", snapshot, "--output", rebuilt], { encoding: "utf8" });
  assert.notEqual(invalidScenario.status, 0);
  assert.match(invalidScenario.stderr, /Invalid derived ranking order/);
  console.log("Derived-page CLI end-to-end checks passed: restricted source stays private, safe snapshots rebuild identically, and unsafe artifacts fail closed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
