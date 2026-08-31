export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface MetricDefinition {
  unit: string;
  better: "higher" | "lower";
  task: string;
  methodologyUrl: string | null;
}

export interface CatalogAlias {
  provider: string;
  modelId: string;
  piThinkingLevel?: ThinkingLevel;
  equivalence: "verified" | "probable";
}

export interface CatalogVariant {
  id: string;
  creator: string;
  displayName: string;
  checkpoint: string | null;
  quantization: string | null;
  reasoning?: { label: string } | null;
  metrics: {
    smart: number;
    fast: number;
    cheap: number;
  };
  aliases: CatalogAlias[];
  provenance: Record<string, unknown>;
}

export interface ModelSelectionCatalog {
  schemaVersion: 1;
  catalog: {
    id: string;
    name: string;
    version: string;
    generatedAt: string;
    sourceUpdatedAt: string | null;
    distribution: {
      classification: "restricted" | "redistributable";
      termsUrl: string | null;
      attribution: string | null;
      allowRedistribution: boolean;
    };
    metricDefinitions: {
      smart: MetricDefinition & { better: "higher" };
      fast: MetricDefinition & { better: "lower" };
      cheap: MetricDefinition & { better: "lower" };
    };
    provenance: Record<string, unknown>;
  };
  variants: CatalogVariant[];
}
