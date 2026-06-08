# Pool B Pro EA: WickReversalBot v7 + REST bridge

This folder contains the MQL5 EAs that run on the FBS **Pro** master
account (Pool B). The strategy is the in-house **WickReversalBot v7**
(XAUUSD, M5, magic `20250101`), wrapped by `WickReversalBotBridge.mq5`
which posts every trade event to the platform REST API.

## Files

| File | Purpose |
|------|---------|
| `WickReversalBot_v7.mq5` | Pure strategy core (signals + order open). No network code. |
| `Bridge.mqh` | Shared include: HMAC-SHA256, WebRequest GET/POST, JSON helpers. |
| `WickReversalBotBridge.mq5` | EA wrapper that loads the v7 strategy and posts events to the server. |

> **Note:** the SignalExecutor EA (Pool A) also lives in this folder and
> `#include`s the same `Bridge.mqh`. There is **no** duplicated HMAC or
> HTTP code in either EA.

## Strategy (WickReversalBot v7)

* Symbol: **XAUUSD**, timeframe **M5** (configurable in the EA inputs).
* Detects a wick-reversal candle:
  * Wick >= 55% of candle range.
  * Body <= 35% of candle range.
  * Closes near the opposite extreme (bullish or bearish).
* Trend filter: fast EMA(8) vs slow EMA(21).
* Stop-loss sits 10% of candle range beyond the sweep wick.
* Take-profit = entry + risk * `InpRiskReward` (default 1.5).
* Max simultaneous trades: 3 (configurable).

## Bridge endpoints

For every trade this EA opens, it POSTs:

```
POST {API_BASE_URL}/api/v1/ea/trade-opened
Headers: Content-Type: application/json
         X-Signature: <hex(HMAC-SHA256(body, API_HMAC_SECRET))>
Body: {"pool":"B","ticket":<id>,"symbol":"XAUUSD","type":"buy|sell",
       "lotSize":<n>,"openPrice":<n>,"sl":<n>,"tp":<n>,
       "eaSource":"wickbot"}
```

For every trade that closes, it POSTs:

```
POST {API_BASE_URL}/api/v1/ea/trade-closed
Body: {"pool":"B","ticket":<id>,"closePrice":<n>,"pnl":<n>,
       "closedAt":"YYYY.MM.DD HH:MM:SS"}
```

Every 30 seconds the EA polls:

```
GET {API_BASE_URL}/api/v1/investments/status?pool=B
Header: X-Signature: <hex(HMAC-SHA256("/api/v1/investments/status?pool=B", secret))>
```

If the response contains an active investment with `status: "paused"`,
the EA logs the fact and **skips opening new trades** until the server
reverts the flag.

## Install on FBS / MetaTrader 5

> Run on a Windows VPS hosted close to the FBS Pro account server.
> The same VPS can run both the Pro EA and the SignalExecutor EA.

1. **Copy the files** into your MT5 data folder:
   ```
   <MT5_DATA_DIR>\MQL5\Experts\BrokerPlatform\Bridge.mqh
   <MT5_DATA_DIR>\MQL5\Experts\BrokerPlatform\WickReversalBot_v7.mq5
   <MT5_DATA_DIR>\MQL5\Experts\BrokerPlatform\WickReversalBotBridge.mq5
   ```
   (`<MT5_DATA_DIR>` is usually `C:\Users\<you>\AppData\Roaming\MetaQuotes\Terminal\<id>\`.)

2. **Compile** in MetaEditor (F7). Both files must compile with
   `0 error(s), 0 warning(s)`. If v7 emits a warning that you cannot
   remove, document it in the EA's source and ship it anyway — the
   bridge layer above v7 does not silence v7's warnings.

3. **Whitelist the API URL** (mandatory - WebRequest is denied by default):
   1. Tools → Options → Expert Advisors.
   2. Tick **"Allow WebRequest for listed URL"**.
   3. Click **Add** and paste the **exact** value of `API_BASE_URL`
      you will set on the EA, e.g. `https://api.your-broker.example`.
   4. Click OK.

4. **Open the chart** for `XAUUSD`, M5 timeframe.

5. **Drag `WickReversalBotBridge.mq5`** onto the chart. In the
   "Inputs" tab, set:

   | Input | Value |
   |-------|-------|
   | `API_BASE_URL` | `https://api.your-broker.example` (no trailing slash) |
   | `API_HMAC_SECRET` | The Pool B HMAC secret from the platform admin (matches `Pool.hmacSecret` for pool B in the DB). |
   | `POOL_ID` | `B` (default) |
   | `MAGIC_NUMBER` | `20250101` (default, must match v7) |
   | `STATUS_POLL_SEC` | `30` (default) |
   | `VERBOSE_LOG` | `false` for production, `true` while debugging |

   On the "Common" tab, make sure **"Allow Algo Trading"** is checked.

6. **Verify** in the Experts / Journal tab that you see:
   ```
   WickReversalBotBridge: ready symbol=XAUUSD tf=5 magic=20250101 pool=B api=https://...
   WickReversalBotBridge: REMINDER - whitelist API base URL in
   WickReversalBotBridge: Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL
   ```

7. **Test with a demo** Pro FBS account first. The first time a trade
   opens, the Experts tab should log `WRB-Bridge: trade-opened OK
   ticket=... code=200`. On the platform, the new `Trade` row should
   appear in the admin Trades view.

## Compiling cleanly

The v7 strategy core is a pure signal/order module and contains no
unused variables. The bridge wrapper uses every global it declares;
all `OnInit` / `OnTick` / `OnTradeTransaction` paths are reachable.

If you tweak v7 and the MetaEditor flags an unused variable inside
`WickReversalBot_v7.mq5`, fix it in v7 itself (do not silence the
warning inside the bridge layer — the bridge is supposed to leave
v7 untouched).

## Security notes

* The HMAC secret is the *only* credential the EA holds. Treat it
  like a password. Do not commit it to source control.
* If the secret is rotated in the platform admin, update the EA input
  and recompile / reattach.
* The EA only ever talks to the single host in `API_BASE_URL` (via
  WebRequest). It will not call out to anywhere else.
