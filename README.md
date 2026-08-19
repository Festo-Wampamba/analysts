# Analysts

A daily cross-sectional equity screen. Every weekday, the app scores a
54-ticker, 9-sector universe of large- and mid-cap US stocks on Finnhub
market data, and — if any candidate clears the qualification threshold —
generates a sourced investment narrative with Groq (GPT-OSS 120B), emails it
out, and publishes it at `/`. A companion on-demand research workspace at
`/research/[ticker]` runs the same sourced-facts-plus-narrative pipeline for
any single ticker. Quotes, filings, charts, and generated narrative use
separate freshness windows so a cached report never labels an old price as
current.

Every number the model is allowed to write down comes from a fact block the
app fetched and can point back to — see `lib/domain/provenance.ts` and
`lib/ai/guards.ts`. There are no unsourced figures in a report.

## Submission links

- Live application: [analysts.korestandard.com](https://analysts.korestandard.com/)
- Development environment: [dev-analysts.korestandard.com](https://dev-analysts.korestandard.com/)
- GitHub repository: [Festo-Wampamba/analysts](https://github.com/Festo-Wampamba/analysts)
- Architecture diagram: [AI-Powered Equity Research Platform.pdf](<Design%20Diagram/AI-Powered%20Equity%20Research%20Platform.pdf>)

## Data sources

| Source | Used for | Safeguard |
|---|---|---|
| Finnhub | quotes, profiles, valuation and screening metrics, peers, news, earnings calendar, recommendations, and insider activity | schema validation, retry/timeout policy, provider cache, and source-call audit trail |
| SEC Company Facts | annual revenue, profit, income, cash flow, and balance-sheet values | annual 10-K/FY selection with a single shared fiscal-period anchor |
| Twelve Data / Alpha Vantage | intraday and historical chart bars | provider-specific cache TTLs and explicit chart-bar timestamps |
| Groq | structured research and daily-idea narrative | JSON schema validation, sourced numeric allow-list, correction retry, and deterministic fallback |
| Resend | daily-idea delivery | delivery failure is recorded without losing the persisted daily result |

## Local setup

```bash
pnpm install
cp .env.example .env.local   # fill in the values below
pnpm db:migrate              # apply migrations to that DATABASE_URL
pnpm dev
```

`pnpm db:migrate` loads `.env.local` using Next.js environment-file
precedence. The example URL expects a project-specific Postgres instance on
port `5433`; it does not create or start that database. For a deployed
environment, use the intended Neon connection string and verify the target
before applying migrations.

### Environment variables

Authoritative list — from `grep -rhoE "process\.env\.[A-Z_]+" lib/ app/`:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Drizzle ORM). The example uses `localhost:5433`; production and development use their intended Neon database URLs. |
| `FINNHUB_API_KEY` | yes | Market data provider (`lib/source/finnhub.ts`) — quotes, profiles, metrics, peers, relevant news, calendars, insider transactions, and recommendations. |
| `SEC_USER_AGENT` | yes† | Identifying app/contact string required for server-side SEC Company Facts requests. |
| `TWELVE_DATA_API_KEY` | no | Primary cached chart provider — 5-minute 1D bars, hourly 5D bars, and longer historical views. |
| `ALPHA_VANTAGE_API_KEY` | no | Optional fallback for daily and weekly historical charts when its API entitlement permits it. |
| `ALPHA_VANTAGE_DAILY_BUDGET` | no | Application-side request ceiling; defaults to `20`. |
| `GROQ_API_KEY` | yes | LLM narrative generation (`lib/ai/groq.ts`). |
| `GROQ_MODEL` | no | Overrides the Groq model; defaults to `openai/gpt-oss-120b`. The retiring `llama-3.3-70b-versatile` value is remapped automatically, but should be updated in deployment settings. |
| `CRON_SECRET` | yes | Bearer token required on both `POST` and `GET /api/screen`. Generate with `openssl rand -hex 32`. |
| `RESEND_API_KEY` | no* | Delivery of the daily idea email (`lib/email/resend.ts`). |
| `DAILY_IDEA_FROM` | no* | From-address for the daily idea email; must be on a domain verified in Resend. |
| `DAILY_IDEA_TO` | no* | Comma-separated recipient list for the daily idea email. |
| `BUILD_SHA` | no | Build identifier surfaced by `/api/health`; set by CI/Docker, not local dev. Currently unwired in the Dokploy build — see `docs/deploy.md`. |

\* The three Resend variables are jointly optional: if any is missing, email
delivery is skipped and recorded as a delivery error, but the screen run
itself still completes and the idea is still published on `/`
(`lib/email/resend.ts`).

† Required for filing-derived financial tables. If absent, the UI marks that
section unavailable while quote, valuation, screening, and narrative data
continue to render.

### Commands

```bash
pnpm dev          # dev server
pnpm test         # vitest
pnpm run build    # production build
pnpm lint         # eslint
pnpm db:generate  # drizzle-kit generate (schema → migration)
pnpm db:migrate   # apply migrations (scripts/migrate.ts)
```

## Stock-ranking methodology

The daily screen compares a fixed 54-company, 9-sector US universe against
itself on the same trading day. Each raw component is converted to a
cross-sectional percentile rank; the result therefore means “stronger than
the available alternatives today,” not an absolute investment rating.

| Factor | Weight | Sourced components |
|---|---:|---|
| Growth | 20% | TTM revenue growth, TTM EPS growth |
| Profitability | 20% | TTM net margin, TTM return on equity |
| Valuation | 20% | positive P/E and P/S, lower is better |
| Financial strength | 15% | debt/equity (lower is better), current ratio |
| Momentum | 15% | 13-week and 26-week price returns |
| Analyst sentiment | 5% | latest-period buy and strong-buy ratio |
| Insider activity | 5% | net insider share change over the lookback window |

Missing factors are not scored as zero. The composite is the weighted mean of
available factor scores, with weights re-normalized over the available data;
coverage remains a separate measure. A company qualifies only when its
composite score is at least `0.65` and at least `0.60` of the configured
factor weight has real data. Invalid negative valuation multiples are
excluded. Ties resolve alphabetically by ticker, the top 20 results are
retained for inspection, and the engine publishes no daily idea when no
company clears both gates. The implementation is in `lib/screen/score.ts` and
its behavior is covered by `lib/screen/score.test.ts`.

The LLM does not rank stocks and cannot introduce a new candidate. It receives
the selected company’s sourced fact block only after deterministic scoring,
writes the narrative, and passes a numerical allow-list check. If generation
or correction fails, the application uses a deterministic sourced fallback.

## Cost estimate

Planning assumptions as of August 2026, in USD:

- Model: Groq `openai/gpt-oss-120b`, priced at $0.15 per million uncached
  input tokens and $0.60 per million output tokens.
- Typical report: 4,000 input tokens and 1,000 output tokens, estimated at
  **$0.0012 per report**, or up to **$0.0024** when the numerical-verification
  correction request also runs.
- Monthly scenario: 22 scheduled daily ideas plus 100 manual reports (122
  generations) costs about **$0.15/month** in normal LLM usage, or about
  **$0.30/month** if every generation requires one correction.
- Current low-volume stack: approximately **$6–$10/month total**, assuming a
  small VPS and the free Neon and Resend tiers. Domain registration, taxes,
  regional VPS price differences, and paid market-data upgrades are excluded.

The arithmetic is executable in `lib/submission/costs.ts` and tested in
`lib/submission/costs.test.ts`. Recheck provider rates before budgeting:
[Groq pricing](https://groq.com/pricing),
[Neon pricing](https://neon.com/pricing), and
[Resend pricing](https://resend.com/pricing).

## Known limitations

- Quotes and chart bars can differ slightly because they are distinct
  provider products sampled at different times. The UI labels the Finnhub
  quote separately from the chart-bar price and timestamp.
- The screening universe is a deliberate, fixed 54-company/9-sector set;
  it is not a complete market universe.
- Provider rate limits or outages can leave a section unavailable. The app
  preserves verified data, labels freshness, and does not invent a value.
- Current deployment uses one long-lived application instance, so its
  in-memory request coalescing and rate limits are not horizontally shared.
- This is research software, not investment advice or a trading system.

## With two additional weeks

1. Add live provider contract checks and alerting for stale prices,
   cross-period financial mismatches, and source-cache failures.
2. Move rate limits and short-lived request coordination to a shared store,
   then add a durable queue for screen execution to support horizontal scale.
3. Expand the universe with maintained inclusion rules, factor backtests,
   sector-neutral controls, and a review dashboard for score drift.
4. Add user accounts, saved research lists, report exports, and scheduled
   digest preferences while retaining complete per-report provenance.
5. Complete Full (Strict) TLS, wire `BUILD_SHA` into Dokploy, and add
   browser-level production smoke tests for both deployed environments.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — module boundaries, request
  flow, deployment path.
- [`docs/runbook.md`](docs/runbook.md) — trigger a run, check status, recover
  from a failure.
- [`docs/deploy.md`](docs/deploy.md) — current infra state and what's still
  outstanding.
