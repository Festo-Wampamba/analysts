// Display/provenance contract from Final-design.md §13.1.

export type SourceStatus = "fresh" | "stale" | "failed" | "unknown";

export type Provenance = {
  provider: string;
  endpoint?: string;
  fetchedAt: string; // ISO timestamp
  providerTimestamp?: string;
  status: SourceStatus;
  httpStatus?: number;
};

export type GeneratedContentMeta = {
  generatedAt: string; // ISO timestamp
  basedOn: string[]; // source block identifiers
  modelLabel?: string;
  limitations?: string[];
};
