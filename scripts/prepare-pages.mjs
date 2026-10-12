#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

async function fetchCatalogBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

async function publishedDeployment(url) {
  const response = await fetch(url);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Published deployment request failed: ${response.status} ${response.statusText}`);
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    console.log(`Published ${url} is not JSON.`);
    return undefined;
  }
}

async function main() {
  const catalogUrl = required("CATALOG_URL");
  const deploymentUrl = required("DEPLOYMENT_URL");
  const sourceCommit = required("SOURCE_COMMIT");
  const catalogPath = required("CATALOG_PATH");
  const siteDir = required("SITE_DIR");
  const compare = process.env.COMPARE === "true";

  const catalog = await fetchCatalogBytes(catalogUrl);
  await writeFile(catalogPath, catalog);
  const deployment = {
    sourceCommit,
    catalogSha256: createHash("sha256").update(catalog).digest("hex"),
  };

  let deploy = true;
  if (compare) {
    const published = await publishedDeployment(deploymentUrl);
    deploy = published?.sourceCommit !== deployment.sourceCommit
      || published?.catalogSha256 !== deployment.catalogSha256;
    console.log(`Published deployment: ${JSON.stringify(published ?? null)}`);
  }
  console.log(`Current deployment: ${JSON.stringify(deployment)}`);
  console.log(deploy ? "Deploying." : "Catalog and source are unchanged since the last deployment. Skipping.");

  if (deploy) {
    await mkdir(siteDir, { recursive: true });
    await writeFile(join(siteDir, "deployment.json"), `${JSON.stringify(deployment, null, 2)}\n`);
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
