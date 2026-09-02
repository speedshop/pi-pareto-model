import { randomUUID } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_PRESETS,
  TOTAL_POWER,
  type ParetoCost,
  type PowerAllocation,
  type PresetDefinition,
  type PresetDefinitions,
  type SubscriptionRoutes,
} from "../ranking/power.js";
import type { Preset } from "../routes/types.js";

export type CatalogSource =
  | { type: "file"; path: string }
  | { type: "github"; repository: string; path: string }
  | { type: "http"; url: string; headers?: Record<string, string> };

export interface ConfigPresetDefinition {
  smart: number;
  time: number;
  cost: number;
  subscriptionRoutes?: SubscriptionRoutes;
  paretoCost?: ParetoCost;
}

export interface PickerConfig {
  source: CatalogSource;
  cacheTtlHours?: number;
  presets?: Record<Preset, ConfigPresetDefinition>;
}

export interface LocatedConfig {
  config: PickerConfig;
  path: string;
}

const CONFIG_FILE = "pareto-model-picker.json";
const PRESET_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

function isPresetDefinition(value: unknown): value is ConfigPresetDefinition {
  if (!value || typeof value !== "object") return false;
  const preset = value as Record<string, unknown>;
  const values = [preset.smart, preset.time, preset.cost];
  const validAllocation = values.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0)
    && values.reduce<number>((sum, item) => sum + (item as number), 0) === TOTAL_POWER;
  const validSubscriptionRoutes = preset.subscriptionRoutes === undefined
    || preset.subscriptionRoutes === "compete"
    || preset.subscriptionRoutes === "only";
  const validParetoCost = preset.paretoCost === undefined
    || preset.paretoCost === "effective"
    || preset.paretoCost === "reference";
  return validAllocation && validSubscriptionRoutes && validParetoCost;
}

function isConfig(value: unknown): value is PickerConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as { source?: unknown; presets?: unknown; cacheTtlHours?: unknown };
  const source = config.source;
  if (!source || typeof source !== "object") return false;
  const candidate = source as Record<string, unknown>;
  const validHeaders = candidate.headers === undefined
    || (candidate.headers !== null
      && typeof candidate.headers === "object"
      && Object.values(candidate.headers).every((header) => typeof header === "string"));
  const validSource = (candidate.type === "file" && typeof candidate.path === "string")
    || (candidate.type === "github"
      && typeof candidate.repository === "string"
      && typeof candidate.path === "string")
    || (candidate.type === "http" && typeof candidate.url === "string" && validHeaders);
  const validCacheTtl = config.cacheTtlHours === undefined
    || (typeof config.cacheTtlHours === "number" && Number.isFinite(config.cacheTtlHours) && config.cacheTtlHours >= 0);
  if (!validSource || !validCacheTtl) return false;
  if (config.presets === undefined) return true;
  if (!config.presets || typeof config.presets !== "object") return false;
  const entries = Object.entries(config.presets);
  return entries.length > 0 && entries.every(([name, preset]) => PRESET_NAME.test(name) && isPresetDefinition(preset));
}

async function readConfig(path: string): Promise<LocatedConfig | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (parsed && typeof parsed === "object" && Object.hasOwn(parsed, "allocations")) {
      throw new Error(`The allocations setting in ${path} is obsolete. Replace it with presets.`);
    }
    if (!isConfig(parsed)) throw new Error(`Invalid picker configuration in ${path}`);
    return { config: parsed, path };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function loadConfig(ctx: ExtensionContext): Promise<LocatedConfig> {
  const globalPath = join(getAgentDir(), CONFIG_FILE);
  const projectPath = join(ctx.cwd, CONFIG_DIR_NAME, CONFIG_FILE);
  const project = ctx.isProjectTrusted() ? await readConfig(projectPath) : undefined;
  const located = project ?? await readConfig(globalPath);

  if (!located) {
    throw new Error(`No catalog configured. Create ${globalPath} with a file or HTTP source.`);
  }

  if (located.config.source.type === "file" && !isAbsolute(located.config.source.path)) {
    located.config.source.path = resolve(located.path, "..", located.config.source.path);
  }
  return located;
}

function serializePreset(preset: PresetDefinition): ConfigPresetDefinition {
  return {
    smart: preset.allocation.smart,
    time: preset.allocation.fast,
    cost: preset.allocation.cheap,
    subscriptionRoutes: preset.subscriptionRoutes,
    paretoCost: preset.paretoCost,
  };
}

export async function saveConfiguredAllocation(
  path: string,
  preset: Preset,
  allocation: PowerAllocation,
  presets: PresetDefinitions,
): Promise<void> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isConfig(parsed)) throw new Error(`Invalid picker configuration in ${path}`);
  parsed.presets ??= Object.fromEntries(Object.entries(presets).map(([name, definition]) => [name, serializePreset(definition)]));
  const configured = parsed.presets[preset];
  if (!configured) throw new Error(`Preset ${preset} is not configured in ${path}`);
  parsed.presets[preset] = {
    ...configured,
    smart: allocation.smart,
    time: allocation.fast,
    cost: allocation.cheap,
  };
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const mode = (await stat(path)).mode & 0o777;
  await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode });
  await rename(temporaryPath, path);
}

export function configuredPresets(config: PickerConfig): PresetDefinitions {
  const configured = config.presets;
  if (!configured) return structuredClone(DEFAULT_PRESETS);
  return Object.fromEntries(Object.entries(configured).map(([name, preset]) => [name, {
    allocation: { smart: preset.smart, fast: preset.time, cheap: preset.cost },
    subscriptionRoutes: preset.subscriptionRoutes ?? "compete",
    paretoCost: preset.paretoCost ?? "effective",
  }]));
}

export function interpolateEnvironment(value: string, env: NodeJS.ProcessEnv = process.env): string {
  const marker = "\0DOLLAR\0";
  const interpolated = value.replaceAll("$$", marker).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, braced: string | undefined, bare: string | undefined) => {
    const name = braced ?? bare;
    const replacement = name ? env[name] : undefined;
    if (replacement === undefined) throw new Error(`Missing environment variable ${name}`);
    return replacement;
  });
  return interpolated.replaceAll(marker, "$");
}
