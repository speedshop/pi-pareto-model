#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_OUTPUT = join(ROOT, "preset-map.html");
const DEFAULT_TEMPLATE = join(ROOT, "visualization", "preset-map.template.html");
const POLES = ["smart", "fast", "cheap"];
const AXES = ["smart", "fast", "cheap"];
const FULL_POWER = 12;

function parseArguments(argv) {
  const options = { gridSize: 8, output: DEFAULT_OUTPUT, template: DEFAULT_TEMPLATE };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--grid-size" && value) options.gridSize = Number(value);
    else if (argument === "--output" && value) options.output = resolve(value);
    else if (argument === "--catalog" && value) options.catalog = resolve(value);
    else if (argument === "--config" && value) options.config = resolve(value);
    else if (argument === "--template" && value) options.template = resolve(value);
    else if (argument === "--pure-poles") options.purePoles = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
    if (argument.startsWith("--") && !["--help", "--pure-poles"].includes(argument)) index += 1;
  }
  if (!Number.isInteger(options.gridSize) || options.gridSize < 1 || options.gridSize > 30) {
    throw new Error("--grid-size must be an integer from 1 through 30");
  }
  return options;
}

function printHelp() {
  console.log(`Build the standalone Pareto preset map.

Usage:
  npm run build:preset-map -- [options]

Options:
  --grid-size N     Hexagons per side (default: 8)
  --catalog PATH    Read a catalog file directly
  --config PATH     Read catalog source and presets from this config
  --output PATH     HTML output (default: preset-map.html)
  --template PATH   HTML template override
  --pure-poles      Use 12/0/0 allocations at the three corners
  --help            Show this help
`);
}

function interpolateEnvironment(value) {
  const marker = "\0DOLLAR\0";
  return value
    .replaceAll("$$", marker)
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, braced, bare) => {
      const name = braced ?? bare;
      if (process.env[name] === undefined) throw new Error(`Missing environment variable ${name}`);
      return process.env[name];
    })
    .replaceAll(marker, "$");
}

async function locateConfig(explicitPath) {
  const candidates = explicitPath
    ? [explicitPath]
    : [join(ROOT, ".pi", "pareto-model-picker.json"), join(homedir(), ".pi", "agent", "pareto-model-picker.json")];
  const path = candidates.find(existsSync);
  if (!path) throw new Error("No picker config found. Pass --config or --catalog.");
  return { path, config: JSON.parse(await readFile(path, "utf8")) };
}

async function loadCatalog(options, locatedConfig) {
  if (options.catalog) return JSON.parse(await readFile(options.catalog, "utf8"));
  const { source } = locatedConfig.config;
  if (!source) throw new Error(`Missing source in ${locatedConfig.path}`);

  if (source.type === "file") {
    const path = isAbsolute(source.path) ? source.path : resolve(dirname(locatedConfig.path), source.path);
    return JSON.parse(await readFile(path, "utf8"));
  }

  if (source.type === "github") {
    const body = execFileSync("gh", [
      "api",
      `repos/${source.repository}/contents/${source.path}`,
      "-H",
      "Accept: application/vnd.github.raw+json",
    ], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    return JSON.parse(body);
  }

  if (source.type === "http") {
    const headers = Object.fromEntries(
      Object.entries(source.headers ?? {}).map(([name, value]) => [name, interpolateEnvironment(value)]),
    );
    const response = await fetch(interpolateEnvironment(source.url), { headers });
    if (!response.ok) throw new Error(`Catalog request failed: ${response.status} ${response.statusText}`);
    return response.json();
  }

  throw new Error(`Unsupported catalog source: ${source.type}`);
}

async function loadRankingModules() {
  const buildDirectory = await mkdtemp(join(tmpdir(), "pi-pareto-map-"));
  await writeFile(join(buildDirectory, "package.json"), '{"type":"module"}\n');
  const tsc = join(ROOT, "node_modules", ".bin", "tsc");
  execFileSync(tsc, [
    "--project", join(ROOT, "tsconfig.json"),
    "--outDir", buildDirectory,
    "--noEmit", "false",
    "--declaration", "false",
    "--sourceMap", "false",
  ], { stdio: "pipe" });
  const rankingRoot = join(buildDirectory, "src", "ranking");
  const [{ paretoFront }, { rankCandidates }, { DEFAULT_PRESETS }] = await Promise.all([
    import(pathToFileURL(join(rankingRoot, "pareto.js"))),
    import(pathToFileURL(join(rankingRoot, "rank.js"))),
    import(pathToFileURL(join(rankingRoot, "power.js"))),
  ]);
  return { paretoFront, rankCandidates, DEFAULT_PRESETS };
}

function configuredPresets(config, defaultPresets) {
  if (!config?.presets) return defaultPresets;
  return Object.fromEntries(Object.entries(config.presets).map(([name, preset]) => [name, {
    allocation: { smart: preset.smart, fast: preset.time, cheap: preset.cost },
    subscriptionRoutes: preset.subscriptionRoutes ?? "compete",
    paretoCost: preset.paretoCost ?? "effective",
  }]));
}

function candidateFor(variant) {
  return {
    key: variant.id,
    variant,
    providerLabel: "",
    selectable: false,
    effectiveCost: variant.metrics.cheap,
    included: false,
    current: false,
  };
}

function interpolatedAllocation(poleAllocations, mix) {
  return Object.fromEntries(AXES.map((axis) => [axis,
    POLES.reduce((value, pole) => value + poleAllocations[pole][axis] * mix[pole], 0),
  ]));
}

function compactQualifier(parenthetical) {
  const effort = parenthetical.match(/(low|medium|high|xhigh|max) effort/i)?.[1]
    ?? parenthetical.match(/^(low|medium|high|xhigh|max)$/i)?.[1];
  if (effort) return effort.toLowerCase();
  return parenthetical.match(/non-reasoning/i) ? "non-reasoning" : "";
}

function compactLabel(name) {
  const parenthetical = name.match(/\(([^)]*)\)/)?.[1] ?? "";
  const qualifier = compactQualifier(parenthetical);
  const base = name.replace(/\s*\([^)]*\).*$/, "").replace(/^Claude\s+/, "");
  const words = base.split(/\s+/);
  if (words.length < 3) return qualifier ? [base, qualifier] : [base];
  const split = Math.ceil(words.length / 2);
  const lines = [words.slice(0, split).join(" "), words.slice(split).join(" ")];
  if (qualifier) lines[1] += ` · ${qualifier}`;
  return lines;
}

function buildMapData(catalog, presets, gridSize, ranking) {
  const missing = POLES.filter((name) => !presets[name]);
  if (missing.length) throw new Error(`The visualization requires these presets: ${missing.join(", ")}`);
  const poleAllocations = Object.fromEntries(POLES.map((pole) => [pole, presets[pole].allocation]));
  const candidates = catalog.variants.map(candidateFor);
  const models = {};
  const winners = [];

  for (let fastUnits = gridSize; fastUnits >= 0; fastUnits -= 1) {
    const row = [];
    for (let smartUnits = 0; smartUnits <= gridSize - fastUnits; smartUnits += 1) {
      const cheapUnits = gridSize - fastUnits - smartUnits;
      const mix = {
        smart: smartUnits / gridSize,
        fast: fastUnits / gridSize,
        cheap: cheapUnits / gridSize,
      };
      const allocation = interpolatedAllocation(poleAllocations, mix);
      const axes = AXES.filter((axis) => allocation[axis] > 0);
      const frontier = ranking.paretoFront(candidates, axes);
      const winner = ranking.rankCandidates(frontier, allocation, axes, frontier)[0];
      if (!winner) throw new Error(`No frontier model for mix ${JSON.stringify(mix)}`);
      models[winner.variant.id] ??= {
        name: winner.variant.displayName,
        label: compactLabel(winner.variant.displayName),
        metrics: winner.variant.metrics,
      };
      row.push(winner.variant.id);
    }
    winners.push(row);
  }

  return {
    gridSize,
    poleAllocations,
    winners,
    models,
    catalog: {
      name: catalog.catalog.name,
      version: catalog.catalog.version,
      attribution: catalog.catalog.distribution.attribution,
    },
  };
}

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const locatedConfig = options.catalog ? undefined : await locateConfig(options.config);
const [catalog, ranking, template] = await Promise.all([
  loadCatalog(options, locatedConfig),
  loadRankingModules(),
  readFile(options.template, "utf8"),
]);
const presets = configuredPresets(locatedConfig?.config, ranking.DEFAULT_PRESETS);
if (options.purePoles) {
  for (const pole of POLES) {
    presets[pole].allocation = Object.fromEntries(AXES.map((axis) => [axis, axis === pole ? FULL_POWER : 0]));
  }
}
const mapData = buildMapData(catalog, presets, options.gridSize, ranking);
const marker = "__PRESET_MAP_DATA__";
if (!template.includes(marker)) throw new Error(`Template is missing ${marker}`);
await writeFile(options.output, template.replace(marker, JSON.stringify(mapData)), "utf8");
console.log(`Built ${options.output} with ${(options.gridSize + 1) * (options.gridSize + 2) / 2} hexagons and ${Object.keys(mapData.models).length} frontier models.`);
