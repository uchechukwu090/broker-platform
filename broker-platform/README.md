# Broker Platform — Dual-Pool PAMM

A two-pool PAMM-style broker that auto-trades user capital via two strategies
on FBS broker accounts:

- **Pool A — Normal** — executes signals from your external signal website.
- **Pool B — Pro** — runs `WickReversalBot v7` (XAUUSD wick-reversal strategy).

Users register, pick a plan (Normal $100 min / Pro $1000 min), choose an
investment duration (minimum 3 days), and watch their share of the pool
move with the master account.

## Architecture

```
                         +-------------------+
   Signal website  ----> | /api/v1/signals   | --+
   (webhook)             +-------------------+   |
                                                 v
                                             [ Redis queue ]
                                                 |
        +-----------------+   poll   +------------+----------+
        | SignalExecutor  | <------  |  /signals/pending?    |
        |  (Pool A EA)    |          |  pool=A               |
        +-----------------+          +------------------------+
        |  trades XAUUSD? no — multi-pair from signals         |
        +-----------------+          +------------------------+
              |                              |
              v                              v
        +-----------+                 +--------------+
        |  FBS A    |  <-- trade -->  |  FBS B       |
        | (Normal)  |                 | (Pro)        |
        +-----------+                 +--------------+
              |                              |
              v                              v
   POST /ea/trade-opened            POST /ea/trade-opened
   POST /ea/trade-closed            POST /ea/trade-closed
              \___________________  ________/
                                 \/
                  +-----------------------------+
                  |  Backend (Node + Express)   |
                  |  - PAMM math (per pool)     |
                  |  - Pool share recompute     |
                  |  - Withdraw lock (endDate)  |
                  |  - Owner bypass             |
                  |  - 2FA + JWT cookies        |
                  +-----------------------------+
                                 |
                                 v
                  +-----------------------------+
                  |  Frontend (Next.js 14)      |
                  |  - Dashboard / Invest /     |
                  |    Investments / Wallet /   |
                  |    Admin / Settings         |
                  +-----------------------------+
```

## Quickstart

```bash
git clone <your-repo> broker-platform
cd broker-platform
cp .env.example .env
# edit .env — set OWNER_EMAIL, OWNER_PASSWORD, ENCRYPTION_KEY, JWT_*, EA_HMAC_*

# build + run everything
docker compose up -d --build

# once running:
#   web:  http://localhost:3000
#   api:  http://localhost:4000
#   db:   localhost:5432
```

## Deploying to Render (recommended for the web/api side)

MQL5 EAs cannot run on Render (Linux only). Use Render for **web + api +
db + redis**, and a **separate Windows VPS** for the EAs.

### One-click via Blueprint

1. Push this repo to GitHub.
2. In Render: **New → Blueprint** → pick your repo.
3. Render reads `render.yaml` and provisions 4 services:
   - `broker-db` (Postgres Starter, $7/mo)
   - `broker-redis` (Key-Value Starter, $10/mo)
   - `broker-api` (Web Starter, $7/mo)
   - `broker-web` (Web Starter, $7/mo)
4. After first apply, fill these env vars on `broker-api` in the
   Render dashboard (they're marked `sync: false` in `render.yaml`):
   - `OWNER_EMAIL` and `OWNER_PASSWORD`
   - `USDT_TRC20_ADDRESS`
   - (optional) `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET`
5. Wait for the API healthcheck at `https://broker-api.onrender.com/health`
   to return `{ ok: true }`.

That's it. The web will be live at `https://broker-web.onrender.com`.

**Cost:** ~$31/mo total. The free tier works for development, but the
web service sleeps after 15min of inactivity which is bad for a 24/7
trading platform.

### EAs go on a Windows VPS (NOT Render)

The two MQL5 EAs need MetaTrader 5, which only runs on Windows. Spin
up a separate Windows VPS (Contabo, Hetzner, Vultr — ~$10/mo for the
smallest), install MT5, log in to the two FBS accounts, drop the EAs
on the charts, and point them at `https://broker-api.onrender.com`.

See the **"Deploying the EAs to a Windows VPS"** section below.

### Custom domains + TLS

Render auto-issues Let's Encrypt certs once you attach a custom domain.
Map `api.yourdomain.com → broker-api` and `app.yourdomain.com → broker-web`.

The owner account is created automatically on the first API boot from
`OWNER_EMAIL` / `OWNER_PASSWORD`.

## Plan tiers

| Plan  | Min deposit | Default pools         | Profit split (user / platform) |
|-------|-------------|------------------------|-------------------------------|
| Normal| $100        | A (signals)            | 70% / 30%                     |
| Pro   | $1,000      | A + B (signals + XAU)  | 80% / 20%                     |

- Investment duration: **minimum 3 days**, no max.
- Withdrawals are **locked** until `endDate`.
- Pro users can toggle Pool A off — their A capital is moved to Pool B
  (XAUUSD-only trading).
- Pro users can also fully pause both bots for the remainder of the
  duration (no new trades, capital held).

## CEO / Owner account

The owner account is created from `OWNER_EMAIL` + `OWNER_PASSWORD` on first
boot. Owner privileges:

- Bypass the minimum-deposit rule.
- Choose **both** pools regardless of plan tier.
- View all users, all trades, the audit log.
- Force pool allocation, override profit splits.

All owner actions are written to the `AuditLog` table.

## Deploying the EAs to a Windows VPS

MQL5 EAs only run on Windows. The web + api live on Render (Linux).
**These are two separate deployments.**

Rent a Windows VPS (Contabo / Hetzner / Vultr, ~$10/mo for the
smallest). On that VPS:

1. Install **MetaTrader 5** and log into each FBS master account
   (one for Pool A, one for Pool B).
2. For each account, install the right EA:
   - Pool A account → `eas/SignalExecutor.mq5`
   - Pool B account → `eas/WickReversalBotBridge.mq5`
3. In MetaEditor, open the `.mq5` file and hit **Compile**.
4. In MT5: **Tools → Options → Expert Advisors → "Allow WebRequest for
   listed URL"** → add your API base URL. **Use the Render URL**, e.g.
   `https://broker-api.onrender.com` (NOT localhost).
5. In MT5: drag the compiled EA onto the chart, fill in the inputs:
   - `API_BASE_URL` → `https://broker-api.onrender.com`
   - `API_HMAC_SECRET` → the matching secret from Render's
     `broker-api` env vars. Use `EA_HMAC_SECRET_PRO` for the Pro EA,
     `EA_HMAC_SECRET_SIGNAL` for the Signal EA. **They must be
     different** and must match what's in Render.
6. Make sure **AutoTrading** is on (the button in the toolbar).
7. Watch the chart for the dashboard widgets and the Experts log.

**Tip:** if Render's `broker-api` ever sleeps or restarts, the EAs
will keep retrying with exponential backoff (1s, 2s, 4s, ... 30s cap)
thanks to the shared `Bridge.mqh` retry logic.

## Pointing your signal website at the API

Your signal site should POST to:

```
POST {API_BASE_URL}/api/v1/signals
Headers:
  Content-Type: application/json
  X-Signature: hmac-sha256-hex(body, EA_HMAC_SECRET_SIGNAL)
Body:
  {
    "id": "sig-...",
    "symbol": "EURUSD",
    "type": "BUY" | "SELL",
    "entry": 1.0850,
    "sl": 1.0800,
    "tp": 1.0950
  }
```

The SignalExecutor EA polls `/api/v1/signals/pending?pool=A` every 2s
and opens the corresponding trade.

## Adding / editing FBS accounts

FBS credentials are stored in the `Pool` table. The seed script creates
one row per pool (A, B) with the HMAC secrets. To insert real FBS
credentials, run the API with `ENCRYPTION_KEY` set, then either:

- Manually update rows via `psql` (the credentials column is AES-GCM
  encrypted; use the `encryptForPool()` helper in `src/utils/crypto.ts`).
- Or extend `scripts/seed.ts` to upsert them at boot.

The EAs do **not** need the FBS account password — they trade as whatever
MT5 user is currently logged in on the VPS.

## Repository layout

```
broker-platform/
├── backend/                  # Node + Express + Prisma
│   ├── prisma/               # schema.prisma, seed.ts
│   ├── scripts/              # bootstrapOwner.ts
│   ├── src/                  # auth, investments, pamm, webhooks, ea, admin
│   ├── tests/                # jest unit tests
│   ├── Dockerfile
│   ├── .env.example
│   └── README.md
├── frontend/                 # Next.js 14 (App Router)
│   ├── app/                  # /, /register, /login, /dashboard, /invest, ...
│   ├── components/           # charts, ui, site-shell
│   ├── lib/api/              # axios client + mock fallback
│   ├── Dockerfile
│   └── .env.example
├── eas/                      # MQL5 source for both EAs
│   ├── Bridge.mqh            # shared HMAC + HTTP helpers
│   ├── WickReversalBot_v7.mq5
│   ├── WickReversalBotBridge.mq5
│   ├── SignalExecutor.mq5
│   └── README.md
├── docker-compose.yml
├── .env.example
├── SPEC.md                   # locked spec
└── README.md                 # ← you are here
```

## Production checklist

Before going live:

- [ ] Replace every `replace-me-...` in `.env` with strong random values.
- [ ] Set `ENCRYPTION_KEY` to a real 32-byte key, store in a secrets manager.
- [ ] Set up TLS (Caddy / nginx in front of api + web).
- [ ] Use a real FBS account (not demo).
- [ ] Configure a payment provider (USDT TRC-20 manual approval, or wire in
      Stripe / NOWPayments for USD).
- [ ] Set up KYC (Sumsub, Onfido, or Persona).
- [ ] Set up monitoring (Prometheus, Grafana, or hosted — Sentry for
      errors).
- [ ] Backups: enable Postgres daily dumps to S3.
- [ ] Legal: terms of service, risk disclosure, AML/KYC policy.
- [ ] Test withdraw flow end-to-end on a tiny amount.
