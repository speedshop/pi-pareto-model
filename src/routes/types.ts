import type { Api, Model } from "@earendil-works/pi-ai";
import type { CatalogAlias, CatalogVariant, ThinkingLevel } from "../catalog/types.js";

export type PiModel = Model<Api>;

export interface ProviderRoute {
  alias: CatalogAlias;
  model: PiModel;
  available: boolean;
  subscription: boolean;
  current: boolean;
}

export interface RankingCalculation {
  contributions: Record<ComparisonAxis, number>;
  worstRegret: number;
}

export interface Candidate {
  key: string;
  variant: CatalogVariant;
  route?: ProviderRoute;
  providerLabel: string;
  selectable: boolean;
  effectiveCost: number;
  included: boolean;
  current: boolean;
  ranking?: RankingCalculation;
  dominatedBy?: Candidate;
  thinkingLevel?: ThinkingLevel;
}

export const COMPARISON_AXES = ["smart", "fast", "cheap"] as const;
export type ComparisonAxis = typeof COMPARISON_AXES[number];
export type CatalogScope = "available" | "full";
export type Preset = string;
