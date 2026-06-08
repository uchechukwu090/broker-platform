# Broker Platform — Backend

Node 20 + TypeScript + Express + Prisma + PostgreSQL + Redis backend for a
broker platform with PAMM pool accounting, EA bridge, HMAC-signed webhooks,
JWT auth (httpOnly cookies) with TOTP 2FA, owner override, and admin tooling.

## Quick start

```bash
# 1. Install deps
npm install

# 2. Copy env and fill in secrets
cp .env.example .env
# (edit DATABASE_URL, REDIS_URL, JWT_*, OWNER_*, POOL_*_HMAC_SECRET, SECRETS_ENC_KEY)

# 3. Generate Prisma client and apply migrations
npm run generate
npm run migrate

# 4. Seed pools A and B
npm run seed

# 5. Bootstrap the owner (idempotent — uses OWNER_EMAIL / OWNER_PASSWORD)
npm run bootstrap:owner

# 6. Run the API
npm run dev          # ts-node-dev with hot reload
# or
npm run build && npm run start
```

## Scripts

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Hot-reload TypeScript server on `PORT` |
| `npm run build` | Compile to `dist/` |
| `npm run start` | Run compiled server |
| `npm run test` | Run Jest test suite |
| `npm run migrate` | Apply Prisma migrations to DB |
| `npm run seed` | Upsert pools A and B |
| `npm run bootstrap:owner` | Idempotently create the `OWNER_EMAIL` user as `role=owner` |
| `npm run generate` | Regenerate Prisma client |

## Architecture

```
src/
├── auth/        # register, login, refresh, logout, 2FA enroll/verify/disable, OAuth stub
├── investments/ # CRUD, pause/resume, pool toggle, withdraw preview + request
├── pamm/        # onTradeClose, share recompute (pure), atomic pool share move
├── pools/       # plan config (Normal / Pro), default allocations, validators
├── webhooks/    # /api/v1/signals HMAC receiver → redis queue
├── ea/          # /api/v1/ea/* bridge for EAs (HMAC, rate-limited)
├── admin/       # /api/v1/admin/* (users, payouts, audit, pools)
├── middleware/  # auth, requireOwner, hmac, audit, error
├── utils/       # crypto, redis, prisma, logger, http (rate limit)
└── config/      # zod-validated env config
```

## Endpoints

### Auth (`/api/v1/auth`)
- `POST /register` — `{ email, password, plan? }`
- `POST /login` — `{ email, password, totp? }` (sets `access_token`, `refresh_token` cookies)
- `POST /refresh` — rotates refresh token
- `POST /logout` — revokes refresh token
- `POST /2fa/enroll` — returns `otpauth`, `qrDataUrl`, 10 `backupCodes`
- `POST /2fa/verify` — `{ token }` flips 2FA on
- `POST /2fa/disable`
- `POST /google` — OAuth stub (returns 503 if `GOOGLE_CLIENT_ID` unset)
- `GET  /google/callback` — stub

### Investments (`/api/v1/investments`)
- `POST /` — create investment
- `GET  /` — list mine
- `GET  /:id` — detail
- `POST /:id/pause` / `POST /:id/resume`
- `POST /:id/toggle-pool` (Pro only)
- `GET  /:id/withdraw-preview` — shows lock state and netPayout math
- `POST /:id/withdraw` — 423 if before `endDate`, otherwise creates `Payout(status=pending)`

### Webhook (`/api/v1/signals`)
- `POST /signals` — `X-Signature: hmac-sha256(body, EA_HMAC_SECRET_SIGNAL)`, body
  `{symbol, type, entry, sl, tp, pool?}`. Pushed to redis queue
  `signals:queue:{A|B}`. Rate limited 10 req/s per IP.

### EA Bridge (`/api/v1/ea`)
- `POST /trade-opened` — HMAC with pool-specific secret
- `POST /trade-closed` — HMAC; triggers PAMM recompute
- `GET  /signals/pending?pool=A|B` — HMAC; returns queued signals, marks dispatched
- `GET  /investments/status?pool=A|B` — HMAC; returns `{investmentId, status}[]`
- All return 401 on bad signature, 429 on rate limit.

### Admin (`/api/v1/admin`) — admin or owner only
- `GET  /users`, `PATCH /users/:id`
- `GET  /payouts`, `PATCH /payouts/:id`
- `GET  /audit`
- `GET  /pools`

## Plans (configurable via env)

| Plan | Min deposit | PnL split | Default allocation |
| ---- | ----------- | --------- | ------------------ |
| Normal | `PLAN_NORMAL_MIN` (100) | `SPLIT_NORMAL` (0.7) | A 100% |
| Pro | `PLAN_PRO_MIN` (1000) | `SPLIT_PRO` (0.8) | A 50% / B 50% |

`MIN_INVEST_DAYS` (3) — both plans. `PLATFORM_FEE_PCT` (0.05) applied to gross
positive PnL when computing `Payout.netPayout`.

`requireOwner` middleware sets `req.user.bypassMinDeposit = true` and
`req.user.forcePoolAllocation = null` (any allocation allowed). This bypasses
`validateInvestmentAmount` minimums in `POST /investments`.

## PAMM accounting

On every trade close:

```
poolPnLPct = tradePnL / pool.totalUserCapital (before)
share.newValue = share.capitalInPool * (1 + poolPnLPct)
pool.totalUserCapital = Σ share.newValue
```

Wrapped in a Prisma `$transaction` so all share updates and the pool total
update commit atomically. The `recomputePoolShares` function is pure for
unit testing (see `tests/pamm.test.ts`).

Pool-share movement (A→B for Pro toggle) is also transactional: it adjusts
both `Pool.totalUserCapital` values and updates `PoolShare.poolId` in a single
Prisma transaction. Audit log entry written for every admin/owner/pool-toggle
action with `before` and `after` JSON snapshots.

## Security

- Bcrypt cost 12 for password hashing.
- JWT access (15m default) + refresh (30d default) tokens in httpOnly cookies.
- HMAC-SHA256 over the raw request body for all signal and EA endpoints.
  Timing-safe comparison.
- AES-256-GCM encryption for FBS account credentials at rest.
- 2FA TOTP (speakeasy) with 10 bcrypt-hashed backup codes per user.
- Express-rate-limit on `/api/v1/signals` (10 req/s) and EA bridge (30 req/s).
- AuditLog table for every admin/owner/pool-toggle action with `before`/`after`.

## Tests

```bash
npm test
```

Coverage:
- `tests/pamm.test.ts` — pure recompute (2 users 50/50 → +5% each)
- `tests/hmac.test.ts` — bad sig → 401, good sig → 200
- `tests/plans.test.ts` — $50 normal rejected, $50 owner accepted
- `tests/duration.test.ts` — withdraw before endDate → 423
- `tests/pool-toggle.test.ts` — A→B transfer atomic, totals preserved
- `tests/crypto.test.ts` — encrypt/decrypt roundtrip, HMAC determinism
- `tests/owner.test.ts` — `requireOwner` sets bypass + force flags
