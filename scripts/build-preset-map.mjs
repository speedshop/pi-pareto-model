#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_OUTPUT = join(ROOT, "preset-map.html");
const DEFAULT_TEMPLATE = join(ROOT, "visualization", "preset-map.template.html");
const RANKING_MODULE = join(ROOT, "src", "ranking.js");
const SCHEMAS = new Map([
  [1, join(ROOT, "schema", "model-selection-catalog.schema.json")],
  [2, join(ROOT, "schema", "model-metrics-catalog.schema.json")],
]);
const VALUE_OPTIONS = { "--catalog": "catalog", "--config": "config", "--output": "output", "--template": "template" };

function parseArguments(argv) {
  const options = { output: DEFAULT_OUTPUT, template: DEFAULT_TEMPLATE };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--allow-restricted") options.allowRestricted = true;
    else if (argument === "--url" && argv[index + 1]) {
      options.url = argv[index + 1];
      index += 1;
    } else if (VALUE_OPTIONS[argument] && argv[index + 1]) {
      options[VALUE_OPTIONS[argument]] = resolve(argv[index + 1]);
      index += 1;
    } else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`Build the standalone Pareto model triangle.

Usage:
  npm run build:preset-map -- [options]

Options:
  --catalog PATH        Read a catalog file directly
  --url URL             Download the catalog from this URL
  --config PATH         Read the catalog source from this config
  --output PATH         HTML output (default: preset-map.html)
  --template PATH       HTML template override
  --allow-restricted    Build from a catalog that does not allow redistribution
  --help                Show this help
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
  if (!path) throw new Error("No catalog config found. Pass --config or --catalog.");
  return { path, config: JSON.parse(await readFile(path, "utf8")) };
}

async function fetchCatalog(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status} ${response.statusText}`);
  return response.json();
}

async function loadCatalog(options) {
  if (options.catalog) return JSON.parse(await readFile(options.catalog, "utf8"));
  if (options.url) return fetchCatalog(options.url);
  const located = await locateConfig(options.config);
  const { source } = located.config;
  if (!source) throw new Error(`Missing source in ${located.path}`);

  if (source.type === "file") {
    const path = isAbsolute(source.path) ? source.path : resolve(dirname(located.path), source.path);
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
    return fetchCatalog(interpolateEnvironment(source.url), headers);
  }

  throw new Error(`Unsupported catalog source: ${source.type}`);
}

async function validateCatalog(catalog) {
  const schemaPath = SCHEMAS.get(catalog?.schemaVersion);
  if (!schemaPath) {
    throw new Error(`Unsupported catalog schemaVersion ${JSON.stringify(catalog?.schemaVersion)}. Expected the number 1 or 2.`);
  }
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(await readFile(schemaPath, "utf8")));
  if (!validate(catalog)) {
    const errors = validate.errors
      .slice(0, 8)
      .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
      .join("; ");
    throw new Error(`Invalid catalog: ${errors}`);
  }
  const ids = new Set();
  for (const variant of catalog.variants) {
    if (ids.has(variant.id)) throw new Error(`Invalid catalog: duplicate variant id ${variant.id}`);
    ids.add(variant.id);
  }
  if (ids.size === 0) throw new Error("Invalid catalog: no variants");
}

function checkRedistribution(catalog, allowRestricted) {
  const { name, distribution } = catalog.catalog;
  if (distribution.allowRedistribution || allowRestricted) return;
  throw new Error([
    `${name} does not allow redistribution, so the built page cannot be shared.`,
    `Attribution: ${distribution.attribution ?? "none provided"}`,
    `Terms: ${distribution.termsUrl ?? "none provided"}`,
    "Pass --allow-restricted to build a private copy anyway.",
  ].join("\n"));
}

function mapData(catalog) {
  return {
    catalog: {
      name: catalog.catalog.name,
      version: catalog.catalog.version,
      generatedAt: catalog.catalog.generatedAt,
      attribution: catalog.catalog.distribution.attribution,
    },
    variants: catalog.variants.map((variant) => ({
      id: variant.id,
      name: variant.displayName,
      creator: variant.creator,
      ...(variant.provenance?.releaseDate ? { releaseDate: variant.provenance.releaseDate } : {}),
      metrics: {
        smart: variant.metrics.smart,
        fast: variant.metrics.fast,
        cheap: variant.metrics.cheap,
      },
    })),
  };
}

function fill(template, marker, value) {
  if (!template.includes(marker)) throw new Error(`Template is missing ${marker}`);
  return template.replace(marker, () => value);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const [catalog, template, rankingModule] = await Promise.all([
    loadCatalog(options),
    readFile(options.template, "utf8"),
    readFile(RANKING_MODULE, "utf8"),
  ]);
  await validateCatalog(catalog);
  checkRedistribution(catalog, options.allowRestricted);
  const data = JSON.stringify(mapData(catalog)).replaceAll("<", "\\u003c");
  const html = fill(fill(template, "__RANKING_MODULE__", rankingModule.replace(/^export /gm, "")), "__PRESET_MAP_DATA__", data);
  await writeFile(options.output, html, "utf8");
  console.log(`Built ${options.output} with ${catalog.variants.length} variants from ${catalog.catalog.name}.`);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
