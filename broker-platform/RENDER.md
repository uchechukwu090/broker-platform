# Render Deployment — Quick Cheat Sheet

> TL;DR: push to GitHub → Render Blueprint → 5 min later you're live.

## 1. Push the repo

```bash
cd broker-platform
git init
git add .
git commit -m "initial broker platform"
# create a GitHub repo, then:
git remote add origin git@github.com:YOUR_USER/broker-platform.git
git push -u origin main
```

## 2. Connect to Render

1. Go to https://dashboard.render.com
2. **New → Blueprint**
3. Pick your `broker-platform` repo
4. Render reads `render.yaml` and shows 4 services it will create:
   - `broker-db` (Postgres Starter)
   - `broker-redis` (Redis Starter)
   - `broker-api` (Web Starter, Docker)
   - `broker-web` (Web Starter, Docker)
5. Click **Apply**. Wait ~5 minutes.

## 3. Fill the secrets

After the first deploy finishes, go to the **`broker-api`** service →
**Environment** tab. These 4 vars are marked `sync: false` and need
manual values:

| Key | What to put |
|-----|-------------|
| `OWNER_EMAIL` | Your real email — this is the CEO account |
| `OWNER_PASSWORD` | A strong password. **Use a password manager.** |
| `USDT_TRC20_ADDRESS` | Your TRC-20 wallet address users deposit to |
| `GOOGLE_OAUTH_CLIENT_ID` | (Optional) from Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | (Optional) |

The other 5 secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`,
`ENCRYPTION_KEY`, `EA_HMAC_SECRET_PRO`, `EA_HMAC_SECRET_SIGNAL`) were
**auto-generated** by Render's `generateValue: true`. You'll need to
read these back to configure the EAs on the Windows VPS:

```bash
# In Render dashboard → broker-api → Environment, copy each value
```

Click **Save Changes** — Render redeploys automatically.

## 4. Smoke test

```bash
curl https://broker-api.onrender.com/health
# → {"ok":true,"time":"2026-..."}

# Try logging in as the owner
curl -X POST https://broker-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<OWNER_EMAIL>","password":"<OWNER_PASSWORD>"}' \
  -c cookies.txt
```

Then open `https://broker-web.onrender.com` in a browser, log in with
the owner email/password, and you should see the dashboard.

## 5. Set up the EAs on a Windows VPS

The EAs are NOT on Render (Linux can't run MT5). You need a Windows
VPS — see `README.md` → "Deploying the EAs to a Windows VPS".

Critical: when configuring the EAs, use the **Render URL** as
`API_BASE_URL` and the **Render-generated secrets** for `API_HMAC_SECRET`.

## Costs

| Service | Plan | Cost |
|---------|------|------|
| broker-db | Starter | $7/mo |
| broker-redis | Starter | $10/mo |
| broker-api | Starter | $7/mo |
| broker-web | Starter | $7/mo |
| Windows VPS (separate) | your pick | ~$10/mo |
| **Total** | | **~$41/mo** |

## Render gotchas to know

1. **Free tier sleeps.** Both web services go to sleep after 15min of
   no traffic. The Starter plan keeps them awake 24/7. Required for a
   trading platform.

2. **Free Postgres dies at 90 days.** Starter has no expiry.

3. **First deploy can take ~10 minutes** because Docker images are
   built on Render. Subsequent deploys are faster.

4. **Logs:** dashboard → service → **Logs** tab. Pino is configured
   to JSON-format in production.

5. **Custom domain:** dashboard → service → **Settings → Custom
   Domain**. Render auto-issues a Let's Encrypt cert.

6. **Scaling:** Starter supports auto-scaling up to a point, but
   the EAs only need one api instance (state is in Postgres/Redis).
   You can run multiple `broker-web` instances behind a CDN for
   global users later.

## Rolling back

If a deploy breaks, dashboard → service → **Manual Deploy → Deploy
from a previous commit**. The old container stays live until the new
one passes its healthcheck.
