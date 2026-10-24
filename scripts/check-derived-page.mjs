#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { validateDerivedRankings } from "../src/derived-rankings.js";

try {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: node scripts/check-derived-page.mjs PAGE.html");
  const html = await readFile(path, "utf8");
  const embedded = html.match(/const mapData = (.*);\n/);
  if (!embedded) throw new Error("Page has no embedded ranking snapshot.");
  const data = JSON.parse(embedded[1]);
  await validateDerivedRankings(data);
  console.log(`Verified ${path}: ${data.variants.length} model labels, ${Object.keys(data.orders).length} derived orders in each of ${1 + data.subscriptions.length} subscription scenarios, no source measurements or numeric ranking scores.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
