CREATE TYPE "public"."research_run_status" AS ENUM('running', 'complete', 'fallback', 'failed');--> statement-breakpoint
CREATE TABLE "provider_cache" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "provider_cache_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"ticker" text NOT NULL,
	"cache_key" text DEFAULT 'default' NOT NULL,
	"payload" jsonb NOT NULL,
	"provider_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "research_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticker" text NOT NULL,
	"status" "research_run_status" DEFAULT 'running' NOT NULL,
	"fact_fingerprint" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_calls" ADD COLUMN "research_run_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_cache_lookup_idx" ON "provider_cache" USING btree ("provider","kind","ticker","cache_key");--> statement-breakpoint
CREATE INDEX "provider_cache_expiry_idx" ON "provider_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "research_runs_ticker_started_idx" ON "research_runs" USING btree ("ticker","started_at");--> statement-breakpoint
ALTER TABLE "source_calls" ADD CONSTRAINT "source_calls_research_run_id_research_runs_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_calls_research_run_id_idx" ON "source_calls" USING btree ("research_run_id");