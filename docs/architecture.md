# Architecture

## Request flow: `/api/screen`

`POST /api/screen` is fire-and-forget. The full run — fetching ~54 tickers,
scoring, enriching the winner, generating a narrative, persisting, emailing —
takes about 3 minutes, longer than Cloudflare will hold a proxied connection
open (this used to cause a 524 timeout even though the origin finished
successfully). So the route claims the trading date synchronously (a fast DB
insert), starts the run in the background without awaiting it, and returns
`202` immediately. `GET /api/screen` polls the same trading-date row for
status. Both verbs require `Authorization: Bearer $CRON_SECRET`.

The full design rationale — why this needs no queue (the app runs as a
long-lived Node process on Dokploy, not serverless), the stale-running
reclaim window, and the test plan — is in
[`docs/superpowers/specs/2026-08-05-async-screen-design.md`](superpowers/specs/2026-08-05-async-screen-design.md).
This doc doesn't repeat it.

There's a second, unrelated read path: `GET /api/daily-idea` and `/`
(`app/page.tsx`) both read the latest persisted idea via
`lib/screen/get-latest-idea.ts` — no auth, no triggering, just a display
query.

## Module boundaries

**`lib/screen/`** — orchestrates a run. `run.ts` holds `claimRun` (insert the
`screen_runs` row, or reclaim a `failed`/stale-`running` one),
`executeScreen` (fetch → score → enrich the winner → generate the narrative
→ persist → email), and the async wrappers `claimScreenRun` /
`runScreenInBackground` / `getScreenStatus` the route calls. `universe.ts`
fixes the 54-ticker/9-sector universe in source (Finnhub's index-constituents
endpoint is premium-only, so it can't be pulled live). `score.ts` computes
composite scores from per-factor sub-scores; `fetch.ts` pulls per-ticker
candidate data from Finnhub; `trading-date.ts` resolves the current US
trading date for idempotency.

**`lib/source/`** — the Finnhub provider boundary. `finnhub.ts` is the single
choke point every market-data call goes through: it attaches the API key,
retries via `lib/http/retry.ts`, validates the response against a Zod schema
in `finnhub-schemas.ts`, and logs every call (success or failure) to the
`source_calls` table via `log.ts`, tagged with `provider`, `endpoint`,
`ticker`, `httpStatus`, `latencyMs`, and a `runId`/`reportId` linkage.
Nothing outside this module talks to Finnhub directly.

**`lib/ai/`** — the Groq provider boundary. `groq.ts` is the equivalent
choke point for narrative generation: one JSON-mode chat completion,
validated against a caller-supplied Zod schema, logged to `source_calls`
with token usage in `meta`. `guards.ts` (`sanitizeSourceText`,
`verifyNumericClaims`) enforces that every number in generated prose exists
in an allowlist built from the sourced facts — a narrative that invents a
figure is rejected and retried once with the offending values named, then
fails the run rather than shipping an unverifiable claim. `report-schema.ts`
defines the Zod shapes for both narrative types (daily idea, research).

**`lib/research/`** — the on-demand per-ticker report pipeline
(`/api/research/[ticker]`, `/research/[ticker]`), independent of the daily
screen. `report.ts` fetches six Finnhub endpoints in parallel with
`Promise.allSettled` (one provider failure degrades coverage rather than
failing the report), checks a 12-hour cache in `reports_cache` first, and
distinguishes "unknown ticker" from "sources unavailable" by whether Finnhub
returned an empty-but-200 quote with no company data. `facts.ts` shapes raw
provider responses into the fact block and its numeric allowlist;
`prompt.ts` builds the system/user prompts; `ticker.ts` validates ticker
input.

**`lib/domain/`** — shared display-contract types with no provider or DB
dependencies, referenced from `Final-design.md` §13. `provenance.ts` defines
`Provenance` (provider, endpoint, fetch time, freshness status) and
`GeneratedContentMeta` (when/what-from a narrative was generated) — every
fact and every generated paragraph in the UI carries one of these so the
reader can see what's sourced versus generated and how fresh it is.
`directional.ts` decides positive/negative/neutral direction and formatting
for deltas and percents in the domain layer, so the UI only renders a
decision already made, never re-derives it.

**`lib/email/`** — `resend.ts` sends the daily idea email via Resend's REST
API directly (no client SDK — a single POST is less code than a dependency).
Delivery failure is recorded but never fails the screen run: the idea is
already persisted and visible on `/` regardless of whether the email went
out. `daily-idea.ts` renders the HTML/text email body from a completed idea.

## Deployment path

GitHub Actions (`daily-screen.yml`, cron `0 13 * * 1-5`, plus `ci.yml` on
PRs) → the daily-screen workflow POSTs to `/api/screen` and polls `GET
/api/screen` for completion → Cloudflare (DNS-proxied, SSL mode Full) sits in
front of the origin and terminates TLS at the edge → Traefik (via Dokploy) is
the origin reverse proxy → the app runs as a Docker container on a
Dokploy-managed Contabo VPS, one environment per branch (`main` → production,
`development` → dev), redeployed automatically on push via a scoped GitHub
webhook → Postgres is Neon, connected via `DATABASE_URL`. Full current state,
what's verified working, and what's still outstanding is in
[`docs/deploy.md`](deploy.md).
