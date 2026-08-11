import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// All timestamps are UTC (timestamptz); US/Eastern conversion happens at render.
// Monetary and score values are numeric, never float.

export const screenRunStatus = pgEnum("screen_run_status", [
  "running",
  "complete",
  "failed",
  "no_qualifying_idea",
]);

export const sourceCallStatus = pgEnum("source_call_status", [
  "fresh",
  "stale",
  "failed",
  "unknown",
]);

export const researchRunStatus = pgEnum("research_run_status", [
  "running",
  "complete",
  "fallback",
  "failed",
]);

export const researchRuns = pgTable(
  "research_runs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ticker: text("ticker").notNull(),
    status: researchRunStatus("status").notNull().default("running"),
    factFingerprint: text("fact_fingerprint"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("research_runs_ticker_started_idx").on(t.ticker, t.startedAt)],
);

export const providerCache = pgTable(
  "provider_cache",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(),
    ticker: text("ticker").notNull(),
    cacheKey: text("cache_key").notNull().default("default"),
    payload: jsonb("payload").notNull(),
    providerTimestamp: timestamp("provider_timestamp", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("provider_cache_lookup_idx").on(
      t.provider,
      t.kind,
      t.ticker,
      t.cacheKey,
    ),
    index("provider_cache_expiry_idx").on(t.expiresAt),
  ],
);

export const screenRuns = pgTable(
  "screen_runs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tradingDate: date("trading_date").notNull(),
    status: screenRunStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    universeSize: integer("universe_size").notNull(),
    universeEvaluated: integer("universe_evaluated").notNull().default(0),
    highestScore: numeric("highest_score", { precision: 5, scale: 4 }),
    threshold: numeric("threshold", { precision: 5, scale: 4 }).notNull(),
    nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Idempotency per business day: a second POST /api/screen the same day
    // hits this constraint and returns the existing run.
    uniqueIndex("screen_runs_trading_date_idx").on(t.tradingDate),
  ],
);

export const screenCandidates = pgTable(
  "screen_candidates",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    runId: integer("run_id")
      .notNull()
      .references(() => screenRuns.id),
    ticker: text("ticker").notNull(),
    sector: text("sector"),
    rank: integer("rank").notNull(),
    // Per-factor sub-scores, kept so "why did this ticker win" is answerable
    // from the database: { growth: 0.82, valuation: 0.61, ... }
    subScores: jsonb("sub_scores").notNull(),
    compositeScore: numeric("composite_score", {
      precision: 5,
      scale: 4,
    }).notNull(),
    catalyst: text("catalyst"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("screen_candidates_run_id_idx").on(t.runId)],
);

export const dailyIdeas = pgTable("daily_ideas", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  // Unique: exactly one publishable outcome per business day.
  tradingDate: date("trading_date").notNull().unique(),
  // Null ticker = "No qualifying idea today".
  ticker: text("ticker"),
  score: numeric("score", { precision: 5, scale: 4 }),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  thresholdAtRun: numeric("threshold_at_run", {
    precision: 5,
    scale: 4,
  }).notNull(),
  narrative: jsonb("narrative"),
  runId: integer("run_id")
    .notNull()
    .references(() => screenRuns.id),
  emailDeliveryError: text("email_delivery_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reportsCache = pgTable(
  "reports_cache",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ticker: text("ticker").notNull(),
    // Sourced facts snapshot (provider-echoed values, pre-computed derivations).
    facts: jsonb("facts").notNull(),
    // Validated model narrative (prose only, passed the numeric guard).
    narrative: jsonb("narrative").notNull(),
    model: text("model").notNull(),
    modelVersion: text("model_version"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reports_cache_ticker_idx").on(t.ticker, t.expiresAt)],
);

export const sourceCalls = pgTable(
  "source_calls",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    provider: text("provider").notNull(),
    endpoint: text("endpoint").notNull(),
    ticker: text("ticker"),
    httpStatus: integer("http_status"),
    providerTimestamp: timestamp("provider_timestamp", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    latencyMs: integer("latency_ms"),
    status: sourceCallStatus("status").notNull(),
    // Linkage: a call belongs to a cached report and/or a screen run.
    reportId: integer("report_id").references(() => reportsCache.id),
    researchRunId: integer("research_run_id").references(() => researchRuns.id),
    runId: integer("run_id").references(() => screenRuns.id),
    // Groq usage object lands here for cost measurement (README §11).
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("source_calls_report_id_idx").on(t.reportId),
    index("source_calls_research_run_id_idx").on(t.researchRunId),
    index("source_calls_run_id_idx").on(t.runId),
  ],
);
