# Analysts

A daily cross-sectional equity screen. Every weekday, the app scores a
54-ticker, 9-sector universe of large- and mid-cap US stocks on Finnhub
market data, and — if any candidate clears the qualification threshold —
generates a sourced investment narrative with Groq (Llama 3.3 70B), emails it
out, and publishes it at `/`. A companion on-demand research workspace at
`/research/[ticker]` runs the same sourced-facts-plus-narrative pipeline for
any single ticker. Quotes, filings, charts, and generated narrative use
separate freshness windows so a cached report never labels an old price as
current.

Every number the model is allowed to write down comes from a fact block the
app fetched and can point back to — see `lib/domain/provenance.ts` and
`lib/ai/guards.ts`. There are no unsourced figures in a report.

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
| `ALPHA_VANTAGE_API_KEY` | no | Enables cached daily and weekly historical charts. Reports degrade cleanly without it. |
| `ALPHA_VANTAGE_DAILY_BUDGET` | no | Application-side request ceiling; defaults to `20`. |
| `GROQ_API_KEY` | yes | LLM narrative generation (`lib/ai/groq.ts`). |
| `GROQ_MODEL` | no | Overrides the Groq model; defaults to `llama-3.3-70b-versatile`. |
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

## Docs

- [`docs/architecture.md`](docs/architecture.md) — module boundaries, request
  flow, deployment path.
- [`docs/runbook.md`](docs/runbook.md) — trigger a run, check status, recover
  from a failure.
- [`docs/deploy.md`](docs/deploy.md) — current infra state and what's still
  outstanding.
