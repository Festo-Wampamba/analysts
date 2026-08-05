# Deployment Handoff — analysts @ Dokploy / Contabo VPS
**Date:** 2026-08-05 · **Owner:** Festo Wampamba

## Goal
Deploy the `analysts` repo (Next.js 16 + Postgres, AI equity research platform) to self-hosted Dokploy
with git-push auto-deploy: `main` → production, `development` → dev environment.

- Production domain: `analysts.korestandard.com`
- Dev domain: `dev.analysts.korestandard.com`

---

## CURRENT BLOCKER (unresolved)

HTTPS does not serve on either domain. Origin serves a **self-signed cert**; Let's Encrypt has never
successfully issued.

**Root cause (confirmed):** Contabo's **network-edge firewall** (my.contabo.com → Network Services →
Firewall → `lupora-tech-prod`) allows inbound 80/443 **only from Cloudflare IP ranges**, with a final
`Block all traffic / DROP / Any` rule. Description on the rule set reads: *"Direct origin access blocked."*

Let's Encrypt HTTP-01 validation requires **direct** inbound access from arbitrary global validator IPs.
These two requirements are mutually exclusive — that is the real contradiction, not a misconfiguration.

**Proof:** `sudo tcpdump -ni eth0 'tcp port 80 and tcp[tcpflags] & tcp-syn != 0'` captured
**0 packets** while loading the site from an external browser. Traffic never reaches the NIC.

---

## CHOSEN FIX (in progress, NOT yet verified)

Stop issuing certs on the origin; let Cloudflare terminate TLS at its edge.

1. Cloudflare → DNS: set `analysts` and `dev.analysts` to **Proxied** (orange cloud)
2. Cloudflare → SSL/TLS → Overview: encryption mode = **Full**

Why **Full** and not **Flexible**: Traefik answers port 80 with a `301` redirect to HTTPS (verified).
Flexible sends Cloudflare→origin over HTTP:80, which would create an infinite redirect loop.
Full connects over 443 and accepts the origin's self-signed cert.

**Verification (last run returned EMPTY — change not applied or not yet propagated):**
```bash
curl -sI https://dev.analysts.korestandard.com/ | head -5
curl -s  https://dev.analysts.korestandard.com/api/health
```
Expect HTTP 200 and a valid cert chain in a browser.

**Proper fix for later (~15–20 min):** switch Traefik cert resolver from HTTP-01 to **DNS-01 via
Cloudflare API token** (Zone:DNS:Edit scope). DNS-01 validates via a TXT record, needs no open inbound
port, is fully compatible with "direct origin access blocked", and enables SSL mode **Full (Strict)**.
Configure in Dokploy → Web Server → Traefik config.

---

## CONFIRMED WORKING

| Item | State |
|---|---|
| GitHub repo `Festo-Wampamba/analysts` | pushed; `main` + `development` branches |
| GitHub App `LuporaTech-Analysts-Deploy` | scoped to this repo only; webhook active on Push |
| Dokploy project `analysts` | production + development environments |
| Dev `web` service | repo `analysts`, branch `development`, Trigger On Push, Autodeploy ON, Dockerfile build |
| Docker build | **succeeds** — Next.js 16.3.0 standalone, routes `/`, `/_not-found`, `/api/health` |
| App container | running: `analysts-web-ql72v3.1.*`, port 3000 |
| Traefik container | `dokploy-traefik`, up, ports 80/443 published |
| Traefik container IPs | bridge `172.17.0.2`, dokploy-network `10.0.1.15` (unchanged) |
| DNS (Cloudflare) | both A records → `161.97.123.233` (VPS eth0), verified via `dig @1.1.1.1` |
| Dokploy DNS check | "DNS Valid" green on dev domain |
| ufw | 80/443 now allowed from anywhere (INPUT); route/FWD rules for Traefik IPs intact |
| Origin HTTP locally | `curl http://analysts.korestandard.com/` → `301` from the VPS itself |

---

## RULED OUT (do not re-investigate)

- **Missing Traefik routes** — routers exist:
  `analysts-web-vckcpy-router-websecure-7@file`, `analysts-web-ql72v3-router-websecure-8@file`
- **Wrong DNS target** — was `169.58.85.25` (different server), fixed to `161.97.123.233`
- **ufw blocking** — opened 80/443 from anywhere; no change in behaviour
- **CrowdSec WAF** — runs as a **systemd service** (not a container); `cscli decisions list` and
  `cscli alerts list` both empty; stopping it entirely did **not** change the ACME failure
- **Container IP drift breaking ufw-docker FORWARD rules** — IPs verified unchanged
- **Docker Swarm service lookups** — app runs as a swarm task but `docker ps` is the correct lookup;
  `docker service ls | grep analysts` returns nothing useful

---

## STILL OUTSTANDING (beyond the cert issue)

1. **No Postgres service in either environment** — no `DATABASE_URL` set. App builds and boots now,
   but anything touching the DB will fail.
2. **Production Provider config unverified** — confirm branch is set to `main` and saved
   (dev's config is confirmed correct).
3. **No end-to-end green deploy** — `/api/health` has never returned 200 over public HTTPS.
4. Production domain card DNS badge never confirmed green.

---

## ENVIRONMENT REFERENCE

- VPS: `luporatech-vps01`, Contabo VPS 20, Ubuntu 24.04.4 LTS
- Public IPv4: `161.97.123.233` · IPv6: `2a02:c207:2341:1491::1`
- SSH: via `ssh lupora-tunnel`, admin access on port 2222
- Dokploy: v0.29.13 at `dokploy.luporatech.com`, org "Lupora Tech"
- Dev service slug: `analysts-web-ql72v3` · Prod service slug: `analysts-web-vckcpy`
- Contabo firewall rule set: `lupora-tech-prod` (3 inbound rules)
