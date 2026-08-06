# Async daily screen (fix 524)

## Problem

`POST /api/screen` runs the full daily screen synchronously (~165s: Finnhub
fetch, scoring, Groq narrative, persistence, email). Cloudflare proxies the
request and returns 524 before the origin responds, even though the origin
completes successfully and commits the result. This makes GitHub Actions
report false failures and gives callers no reliable way to know the run
succeeded short of checking the database directly.

## Architecture

The app runs as a long-lived Node process in a Docker container on Dokploy
(not serverless) — the process survives past the HTTP response, so
background execution needs no new infrastructure (no queue, no Redis).

```
POST /api/screen
  → auth check
  → claimScreenRun() — fast DB insert/reclaim, returns {runId, tradingDate, claimed}
  → not claimed → return 200 + current status (today's run already running/complete)
  → claimed → runScreenInBackground(runId, tradingDate) [not awaited]
            → return 202 {runId, tradingDate, status:"running"}

(background, same Node process)
executeScreen(runId, tradingDate, universe, startedAt)
  → identical to today's runDailyScreen body: fetch, score, enrich,
    narrate, persist, email
  → on error: DB status=failed, log — never rethrows past the
    fire-and-forget boundary

GET /api/screen
  → look up screen_runs by today's trading date (currentTradingDate())
  → 404 {error:"not_started"} | 200 {status: running|complete|no_qualifying_idea|failed, ...}
```

## Components

- **`lib/screen/run.ts`**
  - Extract the current execution body of `runDailyScreen` (fetch through
    final DB writes) into a standalone `executeScreen(runId, tradingDate,
    universe, startedAt)`.
  - `runDailyScreen(universe)` becomes a thin wrapper: `claim → executeScreen`,
    behavior unchanged — all existing tests in `run.test.ts` pass unmodified.
  - New exports:
    - `claimScreenRun(universe?)` — resolves `currentTradingDate()`, calls the
      existing `claimRun`, returns `{runId, tradingDate, claimed}`.
    - `runScreenInBackground(runId, tradingDate, universe)` — calls
      `executeScreen(...)` without awaiting; attaches
      `.catch(err => console.error("background screen run failed:", err))`
      so a rejection never becomes an unhandled promise rejection.
    - `getScreenStatus(tradingDate)` — selects `screen_runs` by trading date;
      if found, formats via the existing `readExistingRun` logic (already
      handles `status === "running"` correctly, including the case where no
      `daily_ideas` row exists yet); returns `null` if no run exists yet.

- **`claimRun` (existing, internal)**: extend the reclaim condition. Today it
  only reclaims `status === "failed"`. Add: also reclaim when
  `status === "running"` and `startedAt` is older than 10 minutes (normal run
  is ~3 minutes; 10 min gives generous margin before assuming the process
  died mid-run, e.g. from a Dokploy autodeploy restart). Reclaim path is
  unchanged otherwise (reset to running, wipe existing candidates for that
  run).

- **`app/api/screen/route.ts`**
  - `POST`: authorize → `claimScreenRun()` → if not claimed, return 200 with
    `getScreenStatus(tradingDate)`; if claimed, call
    `runScreenInBackground(...)` (not awaited) and return 202 with
    `{tradingDate, runId, status: "running"}`.
  - `GET` (new): `getScreenStatus(currentTradingDate())` → 404
    `{error:"not_started"}` if null, else 200 with the status payload.
  - Drop `export const maxDuration = 800` — that existed specifically because
    the handler used to hold the connection open for minutes; no longer true.

- **`.github/workflows/daily-screen.yml`**
  - Replace the single blocking curl with: POST once (accept 200 or 202) →
    poll `GET /api/screen` every 10s for up to 5 minutes → succeed on
    `complete`/`no_qualifying_idea`, fail (`exit 1`) on `failed` or on
    exceeding the poll budget.

## Error handling

- Background execution failure: `executeScreen`'s existing catch block
  (update `screen_runs.status = "failed"`, store `error`, rethrow) is
  unchanged. The fire-and-forget call site is the only new place that must
  catch, purely to stop the rejection from propagating as unhandled.
- A POST that lands while a run is already in progress (`claimed: false`,
  `status: "running"`) is not an error — returns 200 with current progress,
  matching today's idempotent-return behavior.
- Stale-running reclaim only fires past the 10-minute timeout, so a normal
  in-progress run (~3 min) is never touched by it.

## Testing

- `lib/screen/run.test.ts`: no changes required — `runDailyScreen` behavior
  and return shape are identical to today.
- New tests in `run.test.ts` (or a new `run-background.test.ts`):
  - `claimScreenRun` resolves before the slow work runs (mock/spy
    `executeScreen`, assert the DB row exists and the promise returned by
    `claimScreenRun` settles without waiting on it).
  - Stale-running reclaim: a `screen_runs` row with `status:"running"` and
    `startedAt` > 10 min ago is reclaimed by `claimRun`; one with
    `startedAt` inside the window is not.
  - `getScreenStatus`: returns `null` for a trading date with no row,
    correct shape for `running` (no `daily_ideas` row yet) and `complete`.
- `app/api/screen/route.ts` test: POST returns 202 promptly even when the
  background work is deliberately slow (mock `runDailyScreen`'s underlying
  fetch/AI calls, or spy on `executeScreen` with a delayed resolution).

## Out of scope

- Provider retry policy (P1, separate spec).
- Dokploy webhook regeneration, GitHub Actions secret verification — manual
  operator steps, not code changes.
- Any change to `runDailyScreen`'s scoring/narrative/email logic — this is
  an execution-shape change only.
