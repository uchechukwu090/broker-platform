# Build Notes — what shipped, what's not

Hey 👋

Here's an honest rundown of where the build landed.

## What I built (and what's working)

This is a full dual-pool PAMM broker platform with:

- **Backend** (Node + Express + Prisma + PostgreSQL) — auth (JWT +
  optional 2FA), investments, PAMM math, pool toggle, withdrawal lock,
  webhook receiver, EA bridge, audit log, owner override. **Compiles
  clean. 36/36 unit tests pass.**
- **Frontend** (Next.js 14 + TypeScript + Tailwind + Recharts) — all
  the pages you need: landing, register/login/2FA, dashboard with
  equity curve + PnL + pool pie, invest, investments list + detail
  (with pause/toggle/withdraw), wallet, admin (owner), settings. **No
  TS errors.**
- **EA: WickReversalBot v7 (Pool B / Pro)** — your exact v7 source
  preserved verbatim, wrapped in a bridge that posts trade events to
  the API with HMAC signing.
- **EA: SignalExecutor (Pool A / Normal)** — polls
  `/api/v1/signals/pending` every 2s, risk-based lot sizing, retries
  on 5xx with exponential backoff.
- **Shared Bridge.mqh** — single HMAC + HTTP helper used by both EAs.
  No code duplication.
- **Docker compose** — `db` + `redis` + `api` + `web` with health
  checks, volumes, and env wiring.
- **Docs** — README with quickstart + VPS deployment steps + signal
  site webhook guide, plus API.md with every endpoint + curl example.

## What I had to skip (and why)

The team hit the 30-min hard cap mid-build on the first three
producer tracks (backend, frontend, Pro EA). When the engine
auto-paused, I took over directly and finished the remaining three
myself: signal EA, infra, and the integration audit.

So the original "team of 5 producers + verifier" plan never got a
clean cold start. Net result: 36/36 unit tests pass, both typechecks
clean, docker-compose valid — but the original "team audit"
deliverable didn't happen. I wrote a manual final audit (see
`VERIFIER_REPORT.md`) and it covers the same ground.

## What you need to do before going live

1. **Real FBS accounts** — the EAs compile but haven't been run on
   a live account yet. Smoke-test on demo first.
2. **Real secrets in `.env`** — replace every `replace-me-...` with
   strong random hex.
3. **TLS** — put Caddy or nginx in front.
4. **Backups** — daily Postgres dumps to S3.
5. **KYC** — wire Sumsub or Onfido.
6. **ToS / legal** — risk disclosure, AML policy.

The full production checklist is at the bottom of `README.md`.

## How to run it locally

```bash
cd broker-platform
cp .env.example .env
# edit .env (set OWNER_*, JWT_*, ENCRYPTION_KEY, EA_HMAC_*)
docker compose up -d --build
# web at http://localhost:3000
# api at http://localhost:4000
# owner account auto-created on first boot from OWNER_EMAIL/OWNER_PASSWORD
```

The full deployment walkthrough (Windows VPS, MetaTrader setup,
webhook from your signal site) is in the README.
