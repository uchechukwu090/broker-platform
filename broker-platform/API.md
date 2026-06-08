# API Reference

All endpoints under `/api/*` use JSON. Auth uses JWT in httpOnly cookies
(set by the server on login). All admin/owner endpoints require the
`role=admin` or `role=owner` user.

All EA endpoints (`/api/v1/ea/*`, `/api/v1/signals`) require HMAC-SHA256
signatures in `X-Signature: <lowercase-hex>` over the request body (POST)
or the path-and-query (GET).

---

## Auth

### `POST /api/auth/register`

Create a new user.

```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "StrongP@ssw0rd!",
    "plan": "normal"
  }'
```

Response 201:
```json
{ "id": "uuid", "email": "alice@example.com", "plan": "normal" }
```

### `POST /api/auth/login`

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{ "email": "alice@example.com", "password": "StrongP@ssw0rd!" }'
```

Response 200:
```json
{ "twoFactorRequired": false, "user": { "id": "...", "email": "...", "role": "user" } }
```

If 2FA is enabled, response is 200 with `twoFactorRequired: true` and
no session cookie. Call `/api/auth/2fa/verify` next.

### `POST /api/auth/2fa/enroll`

Begin 2FA enrollment. Returns QR + secret.

```bash
curl -X POST http://localhost:4000/api/auth/2fa/enroll \
  -H "Content-Type: application/json" -b cookies.txt
```

### `POST /api/auth/2fa/verify`

Verify a TOTP code. With `{ "code": "123456" }`.

### `POST /api/auth/logout`

```bash
curl -X POST http://localhost:4000/api/auth/logout -b cookies.txt
```

---

## Investments

### `POST /api/investments`

Create a new investment. Owner bypasses minimum.

```bash
curl -X POST http://localhost:4000/api/investments \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{
    "amount": 500,
    "plan": "pro",
    "durationDays": 14
  }'
```

Response 201:
```json
{
  "id": "inv-...",
  "amount": 500,
  "plan": "pro",
  "durationDays": 14,
  "startDate": "2026-06-02T...",
  "endDate":   "2026-06-16T...",
  "status": "active",
  "poolAllocation": { "A": 0.5, "B": 0.5 }
}
```

Errors:
- `422` if `amount < plan min` (and not owner)
- `422` if `durationDays < 3`
- `422` if `plan` not in `normal | pro`

### `GET /api/investments`

List the current user's investments.

### `GET /api/investments/:id`

Detail of one investment.

### `POST /api/investments/:id/pause`

Pause both pool EAs for this investment (capital held, no new trades).

### `POST /api/investments/:id/resume`

Resume trading.

### `POST /api/investments/:id/toggle-pool`

Pro only. Move the user's A capital to B (or vice versa).

### `GET /api/investments/:id/withdraw-preview`

Returns `{ locked: bool, until: ISO8601, projected: number }`.

### `POST /api/investments/:id/withdraw`

Locked before `endDate` (returns 423 Locked). After, creates a `Payout`
with `status=pending`.

---

## Wallet

### `GET /api/wallet/me`

Returns `{ balances: { A: { equity, userPnl }, B: { ... } } }`.

### `POST /api/wallet/deposit`

Manual approval flow. `{ "amount": 500, "currency": "USDT", "txHash": "..." }`
returns `{ payoutId, status: "pending_review" }`.

### `POST /api/wallet/withdraw`

User-initiated withdrawal request. Returns 423 if investment is locked.

---

## Admin (owner only)

### `GET /api/admin/users`

List all users.

### `GET /api/admin/trades`

List all trades across both pools.

### `GET /api/admin/audit-log?actor=...&action=...&limit=50`

Audit log with filters.

### `POST /api/admin/force-allocation`

Owner override: set a user's pool allocation.

```bash
curl -X POST http://localhost:4000/api/admin/force-allocation \
  -H "Content-Type: application/json" -b cookies.txt \
  -d '{ "userId": "...", "allocation": { "A": 0, "B": 1 } }'
```

---

## EA bridge

### `GET /api/v1/signals/pending?pool=A`

EA polls this. Returns `[{ id, symbol, type, entry, sl, tp }, ...]`.
Signed: `X-Signature: hmac-sha256-hex("/api/v1/signals/pending?pool=A", EA_HMAC_SECRET_SIGNAL)`.

### `POST /api/v1/signals`

Webhook from your signal site. Body matches the pending-signal shape.
Signed: `X-Signature: hmac-sha256-hex(body, EA_HMAC_SECRET_SIGNAL)`.

### `POST /api/v1/ea/trade-opened`

EA reports a new trade. Body:
```json
{ "pool": "A|B", "ticket": 123, "symbol": "EURUSD", "type": "BUY",
  "lotSize": 0.1, "openPrice": 1.085, "sl": 1.08, "tp": 1.095,
  "eaSource": "signal" | "wickbot" }
```
Signed with the EA's pool-specific HMAC secret.

### `POST /api/v1/ea/trade-closed`

EA reports a closed trade. Body:
```json
{ "pool": "A|B", "ticket": 123, "closePrice": 1.092, "pnl": 35.0,
  "closedAt": "2026-06-02T15:30:00Z" }
```

### `GET /api/v1/investments/status?pool=A|B`

Returns the list of active investments for that pool. EAs check this
every ~30s to honour pause requests.

---

## Errors

| Code | Meaning |
|------|---------|
| 400  | Bad request body |
| 401  | Not authenticated, or bad HMAC |
| 403  | Authenticated but not allowed (e.g. user hitting admin) |
| 404  | Resource not found |
| 422  | Validation error (Zod) |
| 423  | Locked (e.g. withdraw before endDate) |
| 429  | Rate limited (10 req/s on /api/v1/signals) |
| 500  | Server error |
