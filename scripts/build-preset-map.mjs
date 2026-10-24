#!/usr/bin/env node

import { runBuild } from "../src/build-limits.js";

try {
  await runBuild(new URL("./build-preset-map-worker.mjs", import.meta.url));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
