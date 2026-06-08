//+------------------------------------------------------------------+
//|                                            SignalExecutor.mq5     |
//|                                    Copyright 2025, Broker Platform |
//|                                                                      |
//|  Pool A executor: polls the platform REST API for queued signals,  |
//|  opens the corresponding trades on FBS, and reports lifecycle     |
//|  events back to the server via the shared bridge.                  |
//|                                                                      |
//|  Differences from the Pro EA:                                       |
//|    - Trade decisions come from server-queued signals, not the      |
//|      wick-reversal strategy.                                        |
//|    - Lot sizing is risk-based (risk % of account balance / SL).     |
//|    - Different MagicNumber so positions are distinguishable on FBS. |
//|                                                                      |
//|  Must be installed on a Windows VPS with MetaTrader 5.             |
//|  WebRequest allowlist required:                                     |
//|    Tools -> Options -> Expert Advisors ->                           |
//|    "Allow WebRequest for listed URL" -> add API_BASE_URL.           |
//+------------------------------------------------------------------+
#property copyright "SignalExecutor"
#property version   "1.00"
#property strict

#include <Trade/Trade.mqh>
#include <Bridge.mqh>

CTrade trade;

//=== INPUTS =========================================================
input group "--- API ---"
input string API_BASE_URL        = "http://api.local:4000";  // Platform API base URL
input string API_HMAC_SECRET     = "";                       // HMAC secret for Pool A EA

input group "--- Polling ---"
input int    POLL_INTERVAL_SEC   = 2;     // How often to poll /signals/pending
input int    STATUS_CHECK_SEC    = 30;    // How often to check investment status

input group "--- Risk ---"
input double MAX_RISK_PERCENT    = 1.0;   // Max risk per trade as % of balance
input int    MAGIC_NUMBER        = 20250102;
input int    SLIPPAGE_POINTS     = 30;    // Slippage tolerance for entry

//=== GLOBALS ========================================================
datetime g_lastStatusCheck     = 0;
datetime g_lastPollTime        = 0;
bool     g_anyPaused           = false;
int      g_retryBackoffSec     = 1;

//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(MAGIC_NUMBER);
   trade.SetDeviationInPoints(SLIPPAGE_POINTS);

   if(StringLen(API_HMAC_SECRET) == 0)
   {
      Print("ERROR: API_HMAC_SECRET input is empty. EA disabled.");
      return INIT_FAILED;
   }
   if(StringFind(API_BASE_URL, "http") != 0)
   {
      Print("ERROR: API_BASE_URL must start with http:// or https://");
      return INIT_FAILED;
   }

   EventSetTimer(1);
   Print("SignalExecutor initialized. Polling ", API_BASE_URL,
         " every ", POLL_INTERVAL_SEC, "s.");
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

//+------------------------------------------------------------------+
void OnTimer()
  {
   datetime now = TimeCurrent();

   if((int)(now - g_lastStatusCheck) >= STATUS_CHECK_SEC)
   {
      CheckInvestmentStatus();
      g_lastStatusCheck = now;
   }

   if((int)(now - g_lastPollTime) >= POLL_INTERVAL_SEC)
   {
      PollAndExecuteSignals();
      g_lastPollTime = now;
   }
  }

//+------------------------------------------------------------------+
//| Check server for paused investments. If any of THIS EA's         |
//| investments are paused, skip new entries.                        |
//+------------------------------------------------------------------+
void CheckInvestmentStatus()
  {
   string url = API_BASE_URL + "/api/v1/investments/status?pool=A";
   string resp = "";
   int    code = 0;

   int rc = BRG_HttpGet(url, API_HMAC_SECRET, resp, code);
   if(rc != BRIDGE_OK)
   {
      // Network blip: keep previous state, don't flip g_anyPaused.
      PrintFormat("SignalExecutor: status check rc=%d code=%d (keeping prior state)",
                  rc, code);
      return;
   }
   g_anyPaused = BRG_AnyInvestmentPaused(resp);
   if(g_anyPaused)
      Print("SignalExecutor: at least one investment is paused. Skipping new entries.");
  }

//+------------------------------------------------------------------+
//| Poll /api/v1/signals/pending?pool=A. For each pending signal,     |
//| open a trade.                                                     |
//+------------------------------------------------------------------+
void PollAndExecuteSignals()
  {
   if(g_anyPaused)
   {
      // Still ack the queue? No — server uses dispatchedAt to mark
      // read. We poll but skip opening when paused. The server will
      // time the signal out if it sits too long.
      return;
   }

   string url = API_BASE_URL + "/api/v1/signals/pending?pool=A";
   string resp = "";
   int    code = 0;

   int rc = BRG_HttpGet(url, API_HMAC_SECRET, resp, code);
   if(rc != BRIDGE_OK)
   {
      PrintFormat("SignalExecutor: poll rc=%d code=%d (retry in %ds)",
                  rc, code, g_retryBackoffSec);
      g_retryBackoffSec = MathMin(g_retryBackoffSec * 2, 30);
      Sleep(g_retryBackoffSec * 1000);
      return;
   }
   g_retryBackoffSec = 1;

   // Server returns JSON array. We do a minimal hand-parse: find each
   // top-level object, then key-extract the fields we need.
   ParseAndExecuteSignals(resp);
  }

//+------------------------------------------------------------------+
//| Minimal JSON array-of-objects parser tailored to our signal shape.
//| Expected object fields: id, symbol, type, entry, sl, tp.          |
//+------------------------------------------------------------------+
void ParseAndExecuteSignals(const string &json)
  {
   if(StringLen(json) < 2) return;

   int pos = 0;
   int n   = StringLen(json);

   while(pos < n)
   {
      int objStart = StringFind(json, "{", pos);
      if(objStart < 0) break;
      int objEnd = StringFind(json, "}", objStart);
      if(objEnd < 0) break;

      string obj = StringSubstr(json, objStart, objEnd - objStart + 1);
      pos = objEnd + 1;

      Signal s;
      if(TryParseSignalObject(obj, s))
         ExecuteSignal(s);
   }
  }

//+------------------------------------------------------------------+
//| Pull fields out of a single signal object.                       |
//+------------------------------------------------------------------+
bool TryParseSignalObject(const string &obj, Signal &s)
  {
   s.id     = BRG_JsonGetString(obj, "id");
   s.symbol = BRG_JsonGetString(obj, "symbol");
   s.type   = BRG_JsonGetString(obj, "type");   // "BUY" | "SELL"
   s.entry  = BRG_JsonGetNumber(obj, "entry");
   s.sl     = BRG_JsonGetNumber(obj, "sl");
   s.tp     = BRG_JsonGetNumber(obj, "tp");

   if(StringLen(s.symbol) == 0) return false;
   if(s.sl == 0.0)              return false;
   if(s.entry <= 0.0)           return false;
   return true;
  }

//+------------------------------------------------------------------+
//| Open the trade on FBS, then POST /ea/trade-opened to the server.  |
//+------------------------------------------------------------------+
void ExecuteSignal(const Signal &s)
  {
   if(s.symbol != _Symbol && !IsSymbolSelected(s.symbol))
   {
      PrintFormat("SignalExecutor: symbol %s not in Market Watch, skipping.", s.symbol);
      return;
   }

   double slDistance = 0;
   double ask = SymbolInfoDouble(s.symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(s.symbol, SYMBOL_BID);

   if(StringCompare(s.type, "BUY", false) == 0)
   {
      if(s.sl >= ask)
      {
         PrintFormat("SignalExecutor: bad BUY signal %s sl=%g >= ask=%g",
                     s.symbol, s.sl, ask);
         return;
      }
      slDistance = ask - s.sl;
   }
   else if(StringCompare(s.type, "SELL", false) == 0)
   {
      if(s.sl <= bid)
      {
         PrintFormat("SignalExecutor: bad SELL signal %s sl=%g <= bid=%g",
                     s.symbol, s.sl, bid);
         return;
      }
      slDistance = s.sl - bid;
   }
   else
   {
      PrintFormat("SignalExecutor: unknown type '%s'", s.type);
      return;
   }

   double lots = CalcRiskLotSize(s.symbol, slDistance);
   if(lots <= 0)
   {
      Print("SignalExecutor: lot size 0, skipping.");
      return;
   }

   bool ok = false;
   if(StringCompare(s.type, "BUY", false) == 0)
   {
      ok = trade.Buy(lots, s.symbol, ask, s.sl, s.tp, "SIG BUY " + s.id);
   }
   else
   {
      ok = trade.Sell(lots, s.symbol, bid, s.sl, s.tp, "SIG SELL " + s.id);
   }

   if(!ok)
   {
      PrintFormat("SignalExecutor: order send failed err=%d", GetLastError());
      return;
   }

   ulong  ticket    = trade.ResultOrder();
   double openPrice = trade.ResultPrice();
   string eType     = s.type;

   string body = BRG_JsonTradeOpened("A", ticket, s.symbol, eType, lots,
                                      openPrice, s.sl, s.tp, "signal");
   string url  = API_BASE_URL + "/api/v1/ea/trade-opened";
   string resp = "";
   int    code = 0;
   int rc = BRG_HttpPost(url, body, API_HMAC_SECRET, resp, code);
   if(rc != BRIDGE_OK)
      PrintFormat("SignalExecutor: trade-opened post rc=%d code=%d", rc, code);
  }

//+------------------------------------------------------------------+
//| Risk-based lot sizing:                                            |
//|   risk_cash = balance * MAX_RISK_PERCENT/100                      |
//|   lots      = risk_cash / (slDistance / tickSize * tickValue)     |
//+------------------------------------------------------------------+
double CalcRiskLotSize(const string symbol, double slDistance)
  {
   if(slDistance <= 0) return 0;

   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskCash  = balance * (MAX_RISK_PERCENT / 100.0);

   double tickVal   = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   double minLot    = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxLot    = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double lotStep   = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);

   if(tickVal <= 0 || tickSize <= 0 || lotStep <= 0) return minLot;

   double slTicks   = slDistance / tickSize;
   double lots      = riskCash / (slTicks * tickVal);

   lots = MathFloor(lots / lotStep) * lotStep;
   lots = MathMax(minLot, MathMin(maxLot, lots));

   // Margin safety: don't commit more than 80% of free margin to one trade.
   double marginNeeded = 0;
   double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
   if(OrderCalcMargin(ORDER_TYPE_BUY, symbol, lots, ask, marginNeeded))
   {
      double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
      if(marginNeeded > freeMargin * 0.8 && marginNeeded > 0)
      {
         lots = lots * (freeMargin * 0.8 / marginNeeded);
         lots = MathFloor(lots / lotStep) * lotStep;
         lots = MathMax(minLot, lots);
      }
   }
   return lots;
  }

//+------------------------------------------------------------------+
//| OnTradeTransaction: when one of our positions closes, report it. |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest     &request,
                        const MqlTradeResult      &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

   // Only react to deal-adds that close an existing position (DEAL_ENTRY_OUT).
   if(trans.deal_type != DEAL_TYPE_SELL && trans.deal_type != DEAL_TYPE_BUY)
      return;

   ulong  dealTicket = trans.deal;
   if(!HistoryDealSelect(dealTicket)) return;
   ulong  posId      = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   if(!PositionSelectByTicket(posId)) return;

   if(PositionGetInteger(POSITION_MAGIC) != (long)MAGIC_NUMBER) return;
   if(PositionGetString(POSITION_SYMBOL) != _Symbol)            return;

   // Position still exists: this is an entry, not a close.
   // We want to fire when the position is fully closed.
   if(PositionGetDouble(POSITION_VOLUME) > 0.0) return;

   double closePrice = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double pnl        = HistoryDealGetDouble(dealTicket, DEAL_PROFIT)
                     + HistoryDealGetDouble(dealTicket, DEAL_SWAP)
                     + HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
   datetime closedAt = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);

   string body = BRG_JsonTradeClosed("A", posId, closePrice, pnl, closedAt);
   string url  = API_BASE_URL + "/api/v1/ea/trade-closed";
   string resp = "";
   int    code = 0;
   int rc = BRG_HttpPost(url, body, API_HMAC_SECRET, resp, code);
   if(rc != BRIDGE_OK)
      PrintFormat("SignalExecutor: trade-closed post rc=%d code=%d", rc, code);
  }

//+------------------------------------------------------------------+
//| Helpers that Bridge.mqh didn't ship with.                         |
//+------------------------------------------------------------------+
struct Signal
{
   string id;
   string symbol;
   string type;
   double entry;
   double sl;
   double tp;
};

string BRG_JsonGetString(const string &obj, const string key)
{
   string needle = "\"" + key + "\"";
   int p = StringFind(obj, needle);
   if(p < 0) return "";
   int colon = StringFind(obj, ":", p + StringLen(needle));
   if(colon < 0) return "";
   int q1 = StringFind(obj, "\"", colon + 1);
   if(q1 < 0) return "";
   int q2 = StringFind(obj, "\"", q1 + 1);
   if(q2 < 0) return "";
   return StringSubstr(obj, q1 + 1, q2 - q1 - 1);
}
//+------------------------------------------------------------------+
