# Deploy

Infrastructure is self-hosted: Dokploy on a Contabo VPS, not Vercel. This is
a summary of current state — see `DEPLOY-HANDOFF.md` at the repo root for the
full incident history and troubleshooting detail.

## Stack

- **VPS**: Contabo VPS 20 (`luporatech-vps01`), Ubuntu 24.04.4 LTS.
- **Dokploy** (v0.29.13): manages the app as two environments in one
  project — production (branch `main`, domain
  `analysts.korestandard.com`) and dev (branch `development`, domain
  `dev.analysts.korestandard.com`).
- **Traefik**: the origin reverse proxy, run by Dokploy.
- **Cloudflare**: sits in front of both domains — DNS proxied (orange
  cloud), SSL/TLS mode **Full** (not Flexible: Traefik 301-redirects HTTP→
  HTTPS on port 80, so Flexible would loop; not Full Strict yet, because the
  origin serves a self-signed cert until DNS-01 is wired up).
- **Neon**: Postgres, connected via `DATABASE_URL`.
- **GitHub Actions**: `ci.yml` gates PRs (lint/typecheck/test/build);
  `daily-screen.yml` triggers the cron screen run and polls for completion.

## Autodeploy

Git push triggers a build via a GitHub App (`LuporaTech-Analysts-Deploy`,
scoped to this repo) webhook: `main` → production, `development` → dev.
Confirmed firing in this session for both branches (see the "test:" commits
in git history) — Docker build succeeds, app container comes up on port
3000, Traefik routes exist for both services.

## Known trade-off: Bot Fight Mode disabled zone-wide

As of this session, Cloudflare's basic **Bot Fight Mode is disabled
zone-wide** on `korestandard.com`. This is a deliberate trade-off, not an
oversight: the zone is on Cloudflare's Free plan, and Free-plan **Super Bot
Fight Mode's WAF-skip rule doesn't cover the basic Bot Fight Mode challenge**
— GitHub Actions' rotating runner IPs were getting challenged even with a
custom WAF skip rule scoped to `/api/`, which broke the daily cron trigger.
Disabling Bot Fight Mode entirely was the only way to keep GitHub Actions
reliably reaching `/api/screen` on this plan.

`/api/screen` itself is still gated by `CRON_SECRET` (constant-time
comparison, `app/api/screen/route.ts`), so this isn't an open endpoint — it's
the zone's outer bot-challenge layer that's off, not the app's auth. Worth
revisiting if:

- the cron trigger moves off GitHub-hosted runners — e.g. onto the VPS
  itself via crontab, which would have a stable IP a WAF rule could allowlist
  instead of exempting `/api/` wholesale — or
- the Cloudflare plan is upgraded past Free, where Super Bot Fight Mode's
  WAF-skip does cover the basic challenge.

## Outstanding

From `DEPLOY-HANDOFF.md`'s own "still outstanding" list, plus this session:

- **DNS-01 / Full (Strict) TLS migration not done.** Traefik still validates
  via HTTP-01 and serves a self-signed cert; SSL mode is Full, not Full
  (Strict). The documented fix is switching Traefik's cert resolver to
  DNS-01 via a Cloudflare API token (`Zone:DNS:Edit` scope), configured in
  Dokploy → Web Server → Traefik config. Not a code change.
- **`BUILD_SHA` not wired into the Dokploy build.** `/api/health` reads
  `process.env.BUILD_SHA` and currently always reports `build: "unknown"`
  because nothing sets it. Fix is passing `--build-arg
  BUILD_SHA=$(git rev-parse HEAD)` in Dokploy's build configuration — a
  dashboard change, not a repo change.
- **No Postgres service confirmed wired in either environment** per
  `DEPLOY-HANDOFF.md` at time of writing — verify `DATABASE_URL` is set and
  `/api/health` returns `db: "reachable"` in both production and dev before
  trusting either as fully live.
- **Production Provider config unverified** — confirm the production
  Dokploy service has branch `main` set and saved (dev's config is
  confirmed correct).
- **Orphaned Neon project cleanup** (`floral-morning-80776988`) — blocked
  until the production database mismatch referenced in `DEPLOY-HANDOFF.md`
  is resolved; do not delete until then.
