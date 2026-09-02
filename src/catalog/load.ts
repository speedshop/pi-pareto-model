import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { CatalogSource } from "./config.js";
import { interpolateEnvironment } from "./config.js";
import type { ModelSelectionCatalog } from "./types.js";
import { validateCatalog } from "./validate.js";

interface CacheEntry {
  fetchedAt: string;
  etag?: string;
  lastModified?: string;
  body: string;
}

export interface LoadCatalogOptions {
  ttlHours?: number;
  fetch?: typeof globalThis.fetch;
  githubApi?: (endpoint: string) => Promise<string>;
  cacheDir?: string;
  now?: () => number;
}

function cachePath(url: string, cacheDir: string): string {
  const digest = createHash("sha256").update(url).digest("hex").slice(0, 24);
  return join(cacheDir, `${digest}.json`);
}

async function readCache(path: string): Promise<CacheEntry | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as CacheEntry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

async function saveCache(path: string, entry: CacheEntry): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
}

const execFileAsync = promisify(execFile);

async function githubApi(endpoint: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["api", "-H", "Accept: application/vnd.github.raw+json", endpoint],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    return stdout;
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr).trim()
      : "";
    throw new Error(`GitHub catalog request failed: ${stderr || String(error)}`, { cause: error });
  }
}

async function loadGithub(
  source: Extract<CatalogSource, { type: "github" }>,
  options: LoadCatalogOptions,
): Promise<string> {
  const endpoint = `repos/${source.repository}/contents/${source.path}`;
  return (options.githubApi ?? githubApi)(endpoint);
}

async function loadHttp(source: Extract<CatalogSource, { type: "http" }>, options: LoadCatalogOptions): Promise<string> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const ttlMs = (options.ttlHours ?? 24) * 60 * 60 * 1000;
  const cacheDir = options.cacheDir ?? join(getAgentDir(), "cache", "pareto-model-picker");
  const path = cachePath(source.url, cacheDir);
  const cached = await readCache(path);
  const fetchedAt = cached ? Date.parse(cached.fetchedAt) : Number.NaN;
  if (cached && Number.isFinite(fetchedAt) && now() - fetchedAt < ttlMs) return cached.body;

  const headers = new Headers();
  for (const [name, value] of Object.entries(source.headers ?? {})) {
    headers.set(name, interpolateEnvironment(value));
  }
  if (cached?.etag) headers.set("If-None-Match", cached.etag);
  if (cached?.lastModified) headers.set("If-Modified-Since", cached.lastModified);

  try {
    const response = await fetcher(source.url, { headers });
    if (response.status === 304 && cached) {
      await saveCache(path, { ...cached, fetchedAt: new Date(now()).toISOString() });
      return cached.body;
    }
    if (!response.ok) throw new Error(`Catalog request failed: HTTP ${response.status}`);

    const body = await response.text();
    const entry: CacheEntry = {
      fetchedAt: new Date(now()).toISOString(),
      body,
      ...(response.headers.get("etag") ? { etag: response.headers.get("etag")! } : {}),
      ...(response.headers.get("last-modified") ? { lastModified: response.headers.get("last-modified")! } : {}),
    };
    await saveCache(path, entry);
    return body;
  } catch (error) {
    if (cached) return cached.body;
    throw error;
  }
}

export async function loadCatalog(source: CatalogSource, options: LoadCatalogOptions = {}): Promise<ModelSelectionCatalog> {
  let body: string;
  if (source.type === "file") {
    body = await readFile(source.path, "utf8");
  } else if (source.type === "github") {
    body = await loadGithub(source, options);
  } else {
    body = await loadHttp(source, options);
  }
  return validateCatalog(JSON.parse(body) as unknown);
}
