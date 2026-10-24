#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { checkPageSize } from "../src/build-limits.js";
import { validateDerivedRankings } from "../src/derived-rankings.js";

try {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: node scripts/check-derived-page.mjs PAGE.html");
  const html = await readFile(path, "utf8");
  const reference = html.match(/const mapData = await loadMapData\(("[^"\n]+")\);/);
  if (!reference) throw new Error("Page has no JSON data reference.");
  const name = JSON.parse(reference[1]);
  if (name !== basename(name) || !name.endsWith(".data.json")) throw new Error("Page data must be a sibling .data.json file.");
  const json = await readFile(join(dirname(path), name), "utf8");
  checkPageSize(html, json);
  const data = JSON.parse(json);
  await validateDerivedRankings(data);
  console.log(`Verified ${path} and ${name}: ${data.variants.length} model labels, ${Object.keys(data.orders).length} derived orders in each of ${1 + data.subscriptions.length} subscription scenarios, no source measurements or numeric ranking scores.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
