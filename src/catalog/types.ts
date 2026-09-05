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

export interface SourceMetricOrigin {
  kind: "source";
  benchmarkVersion: string;
}

export interface AdjustedMetricOrigin {
  kind: "adjusted";
  benchmarkVersion: string;
  sourceBenchmarkVersion: string;
  method: "median-overlap-ratio";
  factor: number;
}

export type MetricOrigin = SourceMetricOrigin | AdjustedMetricOrigin;

export interface MetricOrigins {
  smart: SourceMetricOrigin;
  fast: MetricOrigin;
  cheap: MetricOrigin;
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
  metricOrigins: MetricOrigins;
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
