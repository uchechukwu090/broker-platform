//+------------------------------------------------------------------+
//|                                      WickReversalBotBridge.mq5   |
//|                                    Copyright 2025, Broker Platform |
//|                Pro EA - Pool B (XAUUSD) - REST bridge wrapper.    |
//+------------------------------------------------------------------+
//|  This EA is a thin wrapper around WickReversalBot_v7.mq5.        |
//|  It preserves the v7 strategy core and adds a REST bridge:        |
//|                                                                   |
//|    * On every trade opened by this EA, POST                       |
//|      {API_BASE_URL}/api/v1/ea/trade-opened  (pool=B, source=wickbot) |
//|    * On every trade closed by this EA, POST                       |
//|      {API_BASE_URL}/api/v1/ea/trade-closed  (pool=B)              |
//|    * Every 30 seconds, GET                                        |
//|      {API_BASE_URL}/api/v1/investments/status?pool=B              |
//|      and if any active investment is paused, skip new trades.     |
//|                                                                   |
//|  WebRequest allowlist:                                            |
//|    Tools -> Options -> Expert Advisors ->                        |
//|    "Allow WebRequest for listed URL" -> add your API base URL.    |
//|    The base URL set in API_BASE_URL input is what you whitelist.  |
//|                                                                   |
//|  Magic number: 20250101 (matches v7).                             |
//+------------------------------------------------------------------+
#property copyright "Broker Platform"
#property version   "1.00"
#property description "WickReversalBot v7 + REST bridge (Pool B, Pro)"

#include <Trade/Trade.mqh>
#include "Bridge.mqh"
#include "WickReversalBot_v7.mq5"

//+------------------------------------------------------------------+
//| Inputs                                                            |
//+------------------------------------------------------------------+
input string  InpApiBaseUrl      = "https://api.example.com";   // API base URL (https://host:port)
input string  InpApiHmacSecret   = "";                          // HMAC-SHA256 shared secret
input string  InpPoolId          = "B";                         // Pool id (A or B)
input int     InpMagicNumber     = 20250101;                    // Magic (must match v7)
input int     InpStatusPollSec   = 30;                          // Investment status poll (seconds)
input bool    InpVerboseLog      = false;                       // Verbose bridge logging

//+------------------------------------------------------------------+
//| Globals                                                           |
//+------------------------------------------------------------------+
CTrade         g_trade;
WRB_Context    g_ctx;
bool           g_ctxReady      = false;
datetime       g_lastStatusPoll= 0;
bool           g_pausedByServer= false;     // set when status says an active inv is paused

// Track tickets we already reported (avoid duplicate POSTs).
ulong          g_reportedOpen[];
ulong          g_reportedClose[];

//+------------------------------------------------------------------+
//| Helper: find first index of ulong in a ulong array, -1 if not.   |
//+------------------------------------------------------------------+
int FindUlong(const ulong &arr[], const ulong v)
{
   for(int i = 0; i < ArraySize(arr); ++i)
      if(arr[i] == v) return i;
   return -1;
}

//+------------------------------------------------------------------+
//| Helper: mark a ticket as reported-open.                           |
//+------------------------------------------------------------------+
void MarkOpenReported(const ulong ticket)
{
   int n = ArraySize(g_reportedOpen);
   ArrayResize(g_reportedOpen, n + 1);
   g_reportedOpen[n] = ticket;
}

//+------------------------------------------------------------------+
//| Helper: mark a ticket as reported-closed.                         |
//+------------------------------------------------------------------+
void MarkCloseReported(const ulong ticket)
{
   int n = ArraySize(g_reportedClose);
   ArrayResize(g_reportedClose, n + 1);
   g_reportedClose[n] = ticket;
}

//+------------------------------------------------------------------+
//| Helper: was open already reported?                                |
//+------------------------------------------------------------------+
bool IsOpenReported(const ulong ticket)
{
   return (FindUlong(g_reportedOpen, ticket) >= 0);
}

//+------------------------------------------------------------------+
//| Helper: was close already reported?                               |
//+------------------------------------------------------------------+
bool IsCloseReported(const ulong ticket)
{
   return (FindUlong(g_reportedClose, ticket) >= 0);
}

//+------------------------------------------------------------------+
//| POST trade-opened to the server.                                  |
//+------------------------------------------------------------------+
void PostTradeOpened(const ulong  ticket,
                     const string symbol,
                     const string type,
                     const double lotSize,
                     const double openPrice,
                     const double sl,
                     const double tp)
{
   if(StringLen(InpApiHmacSecret) == 0 || StringLen(InpApiBaseUrl) == 0)
   {
      Print("WickReversalBotBridge: API base URL or HMAC secret not set - skipping POST");
      return;
   }

   string body = BRG_JsonTradeOpened(InpPoolId, ticket, symbol, type,
                                     lotSize, openPrice, sl, tp, "wickbot");

   string url = InpApiBaseUrl + "/api/v1/ea/trade-opened";

   string resp = "";
   int    code = 0;
   int    rc   = BRG_HttpPost(url, body, InpApiHmacSecret, resp, code);

   if(rc == BRIDGE_OK)
   {
      PrintFormat("WRB-Bridge: trade-opened OK ticket=%I64u code=%d resp=%s",
                  ticket, code, resp);
   }
   else
   {
      PrintFormat("WRB-Bridge: trade-opened FAILED ticket=%I64u rc=%d code=%d resp=%s",
                  ticket, rc, code, resp);
   }
}

//+------------------------------------------------------------------+
//| POST trade-closed to the server.                                  |
//+------------------------------------------------------------------+
void PostTradeClosed(const ulong  ticket,
                     const double closePrice,
                     const double pnl,
                     const datetime closedAt)
{
   if(StringLen(InpApiHmacSecret) == 0 || StringLen(InpApiBaseUrl) == 0)
   {
      Print("WickReversalBotBridge: API base URL or HMAC secret not set - skipping POST");
      return;
   }

   string body = BRG_JsonTradeClosed(InpPoolId, ticket, closePrice, pnl, closedAt);

   string url = InpApiBaseUrl + "/api/v1/ea/trade-closed";

   string resp = "";
   int    code = 0;
   int    rc   = BRG_HttpPost(url, body, InpApiHmacSecret, resp, code);

   if(rc == BRIDGE_OK)
   {
      PrintFormat("WRB-Bridge: trade-closed OK ticket=%I64u code=%d resp=%s",
                  ticket, code, resp);
   }
   else
   {
      PrintFormat("WRB-Bridge: trade-closed FAILED ticket=%I64u rc=%d code=%d resp=%s",
                  ticket, rc, code, resp);
   }
}

//+------------------------------------------------------------------+
//| GET investments/status?pool=B - sets g_pausedByServer.            |
//+------------------------------------------------------------------+
void PollInvestmentsStatus()
{
   if(StringLen(InpApiHmacSecret) == 0 || StringLen(InpApiBaseUrl) == 0)
      return;

   string url = InpApiBaseUrl + "/api/v1/investments/status?pool=" + InpPoolId;
   string resp = "";
   int    code = 0;

   int rc = BRG_HttpGet(url, InpApiHmacSecret, resp, code);
   if(rc != BRIDGE_OK)
   {
      PrintFormat("WRB-Bridge: status poll failed rc=%d code=%d", rc, code);
      // On hard failure, do not flip the paused bit - keep the last known state.
      return;
   }

   bool paused = BRG_AnyInvestmentPaused(resp);
   if(paused && !g_pausedByServer)
      Print("WRB-Bridge: server reports at least one active investment is PAUSED - skipping new trades");
   if(!paused && g_pausedByServer)
      Print("WRB-Bridge: server reports all active investments are RUNNING - resuming new trades");
   g_pausedByServer = paused;

   if(InpVerboseLog)
      PrintFormat("WRB-Bridge: status poll code=%d paused=%s", code, paused ? "true" : "false");
}

//+------------------------------------------------------------------+
//| Try to open one trade based on the latest candle.                 |
//|   Returns the ticket (>=1) on success, 0 on no-trade.             |
//+------------------------------------------------------------------+
ulong TryOpenFromMarket()
{
   if(!g_ctxReady)
   {
      Print("WRB-Bridge: strategy context not ready");
      return 0;
   }
   if(g_pausedByServer)
   {
      if(InpVerboseLog)
         Print("WRB-Bridge: skip - server says some active investment is paused");
      return 0;
   }

   MqlRates rates[];
   if(!WRB_GetLastCandle(g_ctx.symbol, g_ctx.timeframe, rates))
      return 0;

   double fastVal = 0.0, slowVal = 0.0;
   if(!WRB_EmaValues(g_ctx, fastVal, slowVal))
      return 0;

   WRB_Signal sig;
   if(!WRB_Detect(g_ctx, rates, fastVal, slowVal, sig))
      return 0;
   if(!sig.valid)
      return 0;

   // Avoid re-entering on the same signal bar.
   static datetime lastBarTime = 0;
   if(sig.barTime == lastBarTime) return 0;
   lastBarTime = sig.barTime;

   string err = "";
   ulong ticket = WRB_OpenFromSignal(g_trade, g_ctx.symbol, InpMagicNumber, sig, err);
   if(ticket == 0)
   {
      PrintFormat("WRB-Bridge: open failed: %s", err);
      return 0;
   }

   // Build the human-readable type label.
   string typeLabel = (sig.dir > 0) ? "buy" : "sell";
   double openPrice = (sig.dir > 0)
                      ? SymbolInfoDouble(g_ctx.symbol, SYMBOL_ASK)
                      : SymbolInfoDouble(g_ctx.symbol, SYMBOL_BID);

   // The order result is the deal ticket, not the position ticket; look it up.
   ulong posTicket = ticket;
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagicNumber &&
         PositionGetString(POSITION_SYMBOL)  == g_ctx.symbol &&
         PositionGetDouble(POSITION_PRICE_OPEN) == openPrice)
      {
         posTicket = t;
         break;
      }
   }

   if(!IsOpenReported(posTicket))
   {
      PostTradeOpened(posTicket, g_ctx.symbol, typeLabel, sig.lot,
                      openPrice, sig.sl, sig.tp);
      MarkOpenReported(posTicket);
   }
   return posTicket;
}

//+------------------------------------------------------------------+
//| Scan open positions; for any closed-by-this-EA position that has  |
//| disappeared, POST trade-closed. (MQL5 does not give us a clean    |
//| "position closed" callback; we detect it on the next tick.)       |
//+------------------------------------------------------------------+
void ScanClosedPositions()
{
   // Build the set of currently open position tickets with our magic.
   ulong openNow[];
   ArrayResize(openNow, 0);
   for(int i = PositionsTotal() - 1; i >= 0; --i)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagicNumber &&
         PositionGetString(POSITION_SYMBOL)  == g_ctx.symbol)
      {
         int n = ArraySize(openNow);
         ArrayResize(openNow, n + 1);
         openNow[n] = t;
      }
   }

   // Any ticket we previously reported as OPEN that is no longer open
   // must have been closed.
   for(int i = 0; i < ArraySize(g_reportedOpen); ++i)
   {
      ulong t = g_reportedOpen[i];
      if(FindUlong(openNow, t) >= 0) continue;   // still open
      if(IsCloseReported(t))         continue;   // already reported closed

      // Try to read the deal history for close price + pnl.
      double closePrice = 0.0;
      double pnl        = 0.0;
      datetime closedAt = TimeCurrent();
      if(HistorySelect(TimeCurrent() - 60*60*24*7, TimeCurrent()))
      {
         int total = HistoryDealsTotal();
         for(int k = total - 1; k >= 0; --k)
         {
            ulong deal = HistoryDealGetTicket(k);
            if(deal == 0) continue;
            if(HistoryDealGetInteger(deal, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;
            if(HistoryDealGetInteger(deal, DEAL_MAGIC) != InpMagicNumber) continue;
            if(HistoryDealGetString(deal, DEAL_SYMBOL) != g_ctx.symbol)  continue;
            if(HistoryDealGetInteger(deal, DEAL_POSITION_ID) != (long)t) continue;
            closePrice = HistoryDealGetDouble(deal, DEAL_PRICE);
            pnl        = HistoryDealGetDouble(deal, DEAL_PROFIT)
                       + HistoryDealGetDouble(deal, DEAL_SWAP)
                       + HistoryDealGetDouble(deal, DEAL_COMMISSION);
            closedAt   = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
            break;
         }
      }

      PostTradeClosed(t, closePrice, pnl, closedAt);
      MarkCloseReported(t);
   }
}

//+------------------------------------------------------------------+
//| Expert initialization                                              |
//+------------------------------------------------------------------+
int OnInit()
{
   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(30);
   g_trade.SetTypeFilling(ORDER_FILLING_FOK);

   if(!WRB_Init(g_ctx, InpSymbol, InpTimeframe))
   {
      Print("WickReversalBotBridge: failed to init v7 strategy context");
      return INIT_FAILED;
   }
   g_ctxReady = true;

   // First status poll right away so the bot does not trade before checking.
   g_lastStatusPoll = 0;
   PollInvestmentsStatus();

   PrintFormat("WickReversalBotBridge: ready symbol=%s tf=%d magic=%d pool=%s api=%s",
               InpSymbol, (int)InpTimeframe, InpMagicNumber, InpPoolId, InpApiBaseUrl);
   Print("WickReversalBotBridge: REMINDER - whitelist API base URL in");
   Print("WickReversalBotBridge: Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL");

   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                            |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(g_ctxReady) WRB_Release(g_ctx);
   g_ctxReady = false;
}

//+------------------------------------------------------------------+
//| OnTick - main loop                                                |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!g_ctxReady) return;

   // Status poll every InpStatusPollSec seconds.
   datetime now = TimeCurrent();
   if(now - g_lastStatusPoll >= InpStatusPollSec)
   {
      PollInvestmentsStatus();
      g_lastStatusPoll = now;
   }

   // Try a new entry on every tick (v7 itself filters by bar-time).
   TryOpenFromMarket();

   // Detect any positions that closed since last tick and report them.
   ScanClosedPositions();
}

//+------------------------------------------------------------------+
//| OnTradeTransaction - reserved hook for future server-driven fills |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest    &request,
                        const MqlTradeResult      &result)
{
   // The position-close detection is handled in ScanClosedPositions.
   // We keep this hook reserved for future server-driven actions
   // (e.g. force-close by admin) so the bridge has a single entry
   // point for trade events.
   if(InpVerboseLog)
      PrintFormat("WRB-Bridge: trade transaction type=%I64u deal=%I64u order=%I64u",
                  (ulong)trans.type, trans.deal, trans.order);
}
//+------------------------------------------------------------------+
