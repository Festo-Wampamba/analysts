# Runbook

## Trigger a screen run manually

Either re-run the scheduled workflow:

```bash
gh workflow run daily-screen.yml --ref main
```

or hit the endpoint directly (needs `CRON_SECRET` from the deploy
environment):

```bash
curl -X POST "$SCREEN_URL" -H "authorization: Bearer $CRON_SECRET"
```

`SCREEN_URL` is `https://analysts.korestandard.com/api/screen` in
production, `https://dev.analysts.korestandard.com/api/screen` in dev. A
POST that lands while a run for today is already in progress is not an
error — it returns `200` with the current status instead of starting a
second run (`screen_runs.trading_date` is unique per day).

The endpoint responds immediately (`202` if it started a new run, `200` if
one already existed); the run itself continues in the background for about
3 minutes. Don't wait on the POST response for a result — poll `GET`.

## Check run status

```bash
curl "$SCREEN_URL" -H "authorization: Bearer $CRON_SECRET"
```

Returns `404 {"error":"not_started"}` if no run exists yet for today's
trading date, otherwise `200` with a JSON body including `status`
(`running` / `complete` / `no_qualifying_idea` / `failed`),
`universeEvaluated`/`universeSize`, `highestScore`, `topCandidates`, `idea`,
and (only when `status === "failed"`) `runError`. This is the same polling
loop `.github/workflows/daily-screen.yml` runs after every scheduled
trigger.

## Check overall health

```bash
curl https://analysts.korestandard.com/api/health
```

No auth required. Returns database/build state, boolean provider readiness,
and the latest screen date/status. A reachable service can report
`status: "degraded"` when the screen is stale or the latest attempt failed;
database failure still returns `503`.

## Stale-running reclaim

If a run's `screen_runs` row shows `status: "running"` with a `startedAt`
more than 10 minutes old, the next `POST /api/screen` (or scheduled trigger)
treats it as abandoned — most likely the process died mid-run from a Dokploy
redeploy — and reclaims it: resets the row to `running` with a fresh
`startedAt`, deletes any partial candidates from the dead attempt, and starts
over. A normal run finishes in ~3 minutes, so this never fires on a healthy
in-progress run. See "Stale-running reclaim" in
[`docs/superpowers/specs/2026-08-05-async-screen-design.md`](superpowers/specs/2026-08-05-async-screen-design.md)
for the full design.

If you need to confirm a run is genuinely stuck rather than just slow, check
`startedAt` on the `screen_runs` row for today's trading date directly in
Postgres rather than waiting out the full 10 minutes.

## A run shows `status: "failed"`

1. `GET /api/screen` and read the `runError` field — it's the caught error's
   `message`, e.g. `"unable to evaluate any of 54 universe tickers"` (every
   Finnhub call failed). A model numeric-verification failure now publishes a
   labelled deterministic fallback, so it no longer fails an otherwise valid
   screen.
2. Query the `source_calls` table for the failing run to see which provider
   and endpoint actually failed, and why:

   ```sql
   select provider, endpoint, ticker, http_status, status, meta
   from source_calls
   where run_id = <runId>
   order by created_at desc;
   ```

   `status = 'failed'` rows carry the error detail in `meta` (network
   failure message, non-2xx `httpStatus`, or schema-validation failure).
   `provider` is `finnhub`, `groq`, or `resend`.
3. A failed run is automatically reclaimed and retried on the next trigger
   (manual or scheduled) — no manual reset is needed unless the underlying
   cause (e.g. an expired API key) needs fixing first.
