CREATE TYPE "public"."screen_run_status" AS ENUM('running', 'complete', 'failed', 'no_qualifying_idea');--> statement-breakpoint
CREATE TYPE "public"."source_call_status" AS ENUM('fresh', 'stale', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "daily_ideas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "daily_ideas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"trading_date" date NOT NULL,
	"ticker" text,
	"score" numeric(5, 4),
	"confidence" numeric(5, 4),
	"threshold_at_run" numeric(5, 4) NOT NULL,
	"narrative" jsonb,
	"run_id" integer NOT NULL,
	"email_delivery_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_ideas_trading_date_unique" UNIQUE("trading_date")
);
--> statement-breakpoint
CREATE TABLE "reports_cache" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reports_cache_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ticker" text NOT NULL,
	"facts" jsonb NOT NULL,
	"narrative" jsonb NOT NULL,
	"model" text NOT NULL,
	"model_version" text,
	"generated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screen_candidates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "screen_candidates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"run_id" integer NOT NULL,
	"ticker" text NOT NULL,
	"sector" text,
	"rank" integer NOT NULL,
	"sub_scores" jsonb NOT NULL,
	"composite_score" numeric(5, 4) NOT NULL,
	"catalyst" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screen_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "screen_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"trading_date" date NOT NULL,
	"status" "screen_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"universe_size" integer NOT NULL,
	"universe_evaluated" integer DEFAULT 0 NOT NULL,
	"highest_score" numeric(5, 4),
	"threshold" numeric(5, 4) NOT NULL,
	"next_scheduled_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_calls" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_calls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"ticker" text,
	"http_status" integer,
	"provider_timestamp" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"latency_ms" integer,
	"status" "source_call_status" NOT NULL,
	"report_id" integer,
	"run_id" integer,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_ideas" ADD CONSTRAINT "daily_ideas_run_id_screen_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."screen_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_candidates" ADD CONSTRAINT "screen_candidates_run_id_screen_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."screen_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_calls" ADD CONSTRAINT "source_calls_report_id_reports_cache_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_calls" ADD CONSTRAINT "source_calls_run_id_screen_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."screen_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_cache_ticker_idx" ON "reports_cache" USING btree ("ticker","expires_at");--> statement-breakpoint
CREATE INDEX "screen_candidates_run_id_idx" ON "screen_candidates" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "screen_runs_trading_date_idx" ON "screen_runs" USING btree ("trading_date");--> statement-breakpoint
CREATE INDEX "source_calls_report_id_idx" ON "source_calls" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "source_calls_run_id_idx" ON "source_calls" USING btree ("run_id");