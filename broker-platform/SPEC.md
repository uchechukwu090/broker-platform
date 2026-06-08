# Broker Platform — Final Spec (v1.0)

## Overview
A dual-pool PAMM-style broker platform that auto-trades user capital via two
strategies: (1) external website signals on a Normal FBS account, and (2) an
in-house XAUUSD WickReversalBot v7 EA on a Pro FBS account. Users pick a
plan tier (Normal / Pro), choose an investment duration (3 days minimum),
and watch their proportional share of the pool's PnL grow in real time.

## Core Concepts

### Two FBS Master Accounts
- **Pool A — Normal**: trades signals from the partner signal website (multi-pair).
- **Pool B — Pro**: trades XAUUSD using WickReversalBot v7 (in-house EA).

### Plans
- **Normal**: $100 min, 70/30 profit split, defaults to Pool A only.
- **Pro**: $1000 min, 80/20 split, defaults to both pools (toggleable).
- **CEO/Owner account**: bypasses all minimums, can pick both pools regardless of tier.

### Investment Duration
- User picks duration on investment: minimum **3 days**, no max.
- Withdrawal is locked until end of duration.
- User can fully pause bots for the remainder of duration (no trades, capital held).

### Pool Toggle (Pro only)
- Pro user default: trading on BOTH pools.
- Toggle: move balance from Pool A → Pool B (instant, with admin audit log).
- Toggle back: reallocate from Pool B → Pool A.

## Architecture

### Tech Stack
- **Backend**: Node.js + TypeScript + Express + PostgreSQL + Prisma
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind + Recharts
- **Auth**: JWT (httpOnly cookies) + bcrypt + 2FA (TOTP) + Google OAuth
- **Payments**: Crypto (USDT TRC-20 manual + NOWPayments webhook) + Stripe
- **EA Bridge**: MQL5 EAs post trade events to REST API; webhooks push signals to EAs
- **MQL5 ↔ Server**: REST API with HMAC signature auth
- **Deployment**: Docker compose (db, api, web, ea-bridge)

### Database Schema (key models)
- `User` { id, email, passwordHash, role (user|admin|owner), plan, twoFactorSecret, kycStatus, createdAt }
- `Investment` { id, userId, amount, plan, durationDays, startDate, endDate, status (active|paused|completed|withdrawn), poolAllocation {A: pct, B: pct} }
- `Pool` { id (A|B), fbsAccountLogin, fbsAccountPassword (encrypted), totalEquity, totalUserCapital, lastSyncedAt }
- `PoolShare` { id, investmentId, poolId, capitalInPool, sharePct, lastUpdated }
- `Trade` { id, poolId, ticket, symbol, type, lotSize, openPrice, closePrice, pnl, openedAt, closedAt, eaSource (signal|wickbot) }
- `Payout` { id, userId, investmentId, grossPnl, platformFee, netPayout, status (pending|approved|paid), createdAt }
- `Signal` { id, source, symbol, type, entry, sl, tp, raw, receivedAt, dispatchedTo, status }
- `AuditLog` { id, actorId, action, target, before, after, createdAt }

### PAMM Math
For each pool, on every EA trade close:
```
poolTotalPnL += trade.pnl
for each PoolShare in pool:
  userPnL = poolTotalPnL * (share.capitalInPool / pool.totalUserCapital)
  user.sharePct remains constant during the trade; balance updates post-close
```

### EA Bridge Endpoints
- `POST /api/v1/ea/trade-opened` — EA reports new trade (HMAC signed)
- `POST /api/v1/ea/trade-closed` — EA reports closed trade with PnL
- `GET  /api/v1/signals/pending?pool=A` — EA polls for new signals
- `POST /api/v1/signals` — webhook receiver from signal site (HMAC signed)

### CEO Master Account
- `OWNER_EMAIL` + `OWNER_PASSWORD_HASH` env vars create a superuser on first boot.
- Owner role gets: `bypassMinDeposit`, `forcePoolAllocation`, `viewAllWallets`, `overrideSplits`.
- All owner actions logged in `AuditLog`.

## Frontend Pages
- `/` landing
- `/register`, `/login`, `/verify-2fa`
- `/dashboard` — user home (equity curve, PnL today, plan badge, pool pie)
- `/invest` — pick plan + duration + amount
- `/investments` — list of past/active investments
- `/investments/[id]` — detail (trades, PnL breakdown, pool split, pause/withdraw)
- `/wallet` — deposit/withdraw
- `/admin` — owner only (users, all trades, override, audit log)
- `/settings` — 2FA, KYC, password

## Security
- All EA ↔ server traffic HMAC-SHA256 signed with shared secret per EA.
- FBS credentials encrypted at rest (AES-256-GCM with KMS key from env).
- Rate limit webhook endpoints (10 req/s per IP).
- 2FA required for withdrawals.
- Audit log for all admin/owner actions.

## Deliverables from Team
1. Backend (API + DB + auth + PAMM logic + webhook receiver)
2. Frontend (Next.js dashboard + admin + auth pages)
3. MQL5 EA: WickReversalBot v7 integrated with REST bridge (Pool B / Pro)
4. MQL5 EA: Signal executor (Pool A / Normal) — reads signals from API
5. Docker compose + deployment scripts
6. README + API docs
7. Verifier audit
