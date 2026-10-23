import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
mkdirSync(join(root, "tmp"), { recursive: true });
const directory = mkdtempSync(join(root, "tmp", "derived-e2e-"));
const build = join(root, "scripts", "build-preset-map.mjs");
const check = join(root, "scripts", "check-derived-page.mjs");
const run = (script, args) => execFileSync(process.execPath, [script, ...args], { encoding: "utf8", cwd: root });

try {
  const catalog = JSON.parse(readFileSync(join(root, "test", "fixtures", "model-selection-catalog.json"), "utf8"));
  catalog.catalog.name = "Artificial Analysis Intelligence Index";
  catalog.catalog.distribution = {
    classification: "restricted",
    allowRedistribution: false,
    attribution: "Source: Artificial Analysis (artificialanalysis.ai)",
    termsUrl: "https://artificialanalysiscdn.com/legal/ProDataPlatformTerms.pdf",
  };
  catalog.catalog.provenance = { privateMarker: "PRIVATE_SOURCE_PAYLOAD_MUST_NOT_PUBLISH" };
  catalog.variants.forEach((variant, index) => {
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
  const data = JSON.parse(readFileSync(snapshot, "utf8"));
  assert.deepEqual(JSON.parse(html.match(/const mapData = (.*);\n/)[1]), data);
  assert.equal(data.kind, "derived-rankings-v1");
  assert.equal(Object.keys(data.orders).length, 1225);
  assert.equal(Object.hasOwn(data, "dominators"), false);
  assert.match(html, /Based on data from Artificial Analysis/);
  assert.match(html, /do not represent the views or endorsement/);
  assert.match(html, /M13\.982 16h1\.996/);
  for (const marker of ["PRIVATE_SOURCE_PAYLOAD_MUST_NOT_PUBLISH", "PRIVATE_TRIAL_DETAILS_MUST_NOT_PUBLISH"]) {
    assert.equal(html.includes(marker), false);
    assert.equal(readFileSync(snapshot, "utf8").includes(marker), false);
  }
  for (const variant of catalog.variants) {
    for (const value of Object.values(variant.metrics)) assert.equal(html.includes(String(value)), false);
  }
  run(check, [page]);
  const rebuilt = join(directory, "rebuilt.html");
  run(build, ["--rankings", snapshot, "--output", rebuilt]);
  assert.equal(readFileSync(rebuilt, "utf8"), html);

  data.variants[0].metrics = catalog.variants[0].metrics;
  const unsafe = join(directory, "unsafe.json");
  writeFileSync(unsafe, JSON.stringify(data));
  const rejected = spawnSync(process.execPath, [build, "--rankings", unsafe, "--output", rebuilt], { encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Invalid derived rankings/);
  const tampered = join(directory, "tampered.html");
  writeFileSync(tampered, html.replace(/const mapData = .*;\n/, `const mapData = ${JSON.stringify(data)};\n`));
  assert.notEqual(spawnSync(process.execPath, [check, tampered]).status, 0);

  delete data.variants[0].metrics;
  data.orders["0,0"][0] = data.variants.length;
  writeFileSync(unsafe, JSON.stringify(data));
  const invalidOrder = spawnSync(process.execPath, [build, "--rankings", unsafe, "--output", rebuilt], { encoding: "utf8" });
  assert.notEqual(invalidOrder.status, 0);
  assert.match(invalidOrder.stderr, /Invalid derived ranking order/);
  console.log("Derived-page CLI end-to-end checks passed: restricted source stays private, safe snapshots rebuild identically, and unsafe artifacts fail closed.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
