//+------------------------------------------------------------------+
//|                    WickReversalBot.mq5  v7                       |
//|     Institutional Logic + Circuit Breakers + Asymmetric Scaling  |
//+------------------------------------------------------------------+
#property copyright "WickReversalBot v7"
#property version   "7.00"
#property strict

#include <Trade\Trade.mqh>
CTrade trade;

//=== INPUTS =========================================================
input group "--- Base Risk & Scaling (The Pro Tip) ---"
input double BaseRiskPercent    = 1.0;   // Base risk per trade (Safe Start)
input bool   UseEquityScaling   = true;  // Enable Asymmetric Compounding
input double GrowthMilestone    = 20.0;  // Increase risk every X% account growth
input double RiskIncreaseStep   = 0.25;  // Add X% risk per milestone
input double MaxAllowedRisk     = 3.0;   // Hard cap on risk % (Never exceed)
input double FixedLotSize       = 0.0;   // Overrides all risk calc if > 0

input group "--- Safety Circuit Breakers ---"
input double MaxDailyDrawdown   = 3.0;   // Stop trading if daily DD hits X%
input double MaxWeeklyDrawdown  = 8.0;   // Stop trading if weekly DD hits X%

input group "--- Core Mechanics ---"
input double MinWickPips        = 2.0;   // Minimum internal wick size
input int    CloseSecondsLeft   = 10;    // Fallback time exit
input double ATR_SL_Multiplier  = 0.5;   // SL buffer below wick (Anti Stop-Hunt)
input int    ATR_Period         = 14;

input group "--- Liquidity & Filters ---"
input bool   RequireLiquiditySweep = true;
input double MaxCandleATR_Mult  = 2.5;
input int    TrendLookback      = 3;

input group "--- Intra-Candle Trailing ---"
input bool   UseDynamicTrailing = true;
input double TrailActivationPips= 1.5;
input double TrailStepPips      = 0.5;

input ulong  MagicNumber        = 20250101;

//=== GLOBALS ========================================================
datetime lastCandleTime        = 0;
bool     tradeOpenedThisCandle = false;
double   candleOpenPrice       = 0;
double   prevCandleLow         = 0;
double   prevCandleHigh        = 0;
double   currentATR            = 0;
int      atrHandle             = INVALID_HANDLE;

bool     sweepDownConfirmed    = false;
bool     sweepUpConfirmed      = false;
double   wickExtremeLow        = 0;
double   wickExtremeHigh       = 0;
double   refBalance            = 0;

double   dayStartBalance       = 0;
double   weekStartBalance      = 0;
int      lastTrackedDay        = -1;
int      lastTrackedWeek       = -1;
bool     dailyLimitHit         = false;
bool     weeklyLimitHit        = false;

//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(MagicNumber);
   refBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   dayStartBalance = refBalance;
   weekStartBalance = refBalance;

   EventSetTimer(1);
   atrHandle = iATR(_Symbol, PERIOD_CURRENT, ATR_Period);
   if(atrHandle == INVALID_HANDLE) return INIT_FAILED;

   Print("WickReversalBot v7 (Hedge Fund Edition) initialized.");
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(atrHandle != INVALID_HANDLE) IndicatorRelease(atrHandle);
   ObjectDelete(0, "WRB_Countdown");
   ObjectDelete(0, "WRB_Status");
   ObjectDelete(0, "WRB_RiskDD");
  }

void OnTimer() { DrawDashboard(); }

double GetPipSize() {
   double point  = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int    digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   return (digits == 5 || digits == 3 || digits == 2) ? point * 10 : point;
}

double GetCurrentRisk() {
   if(!UseEquityScaling) return BaseRiskPercent;

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double growthPercent = ((balance - refBalance) / refBalance) * 100.0;

   int milestones = (int)MathMax(0, MathFloor(growthPercent / GrowthMilestone));

   double dynamicRisk = BaseRiskPercent + (milestones * RiskIncreaseStep);

   return MathMin(dynamicRisk, MaxAllowedRisk);
}

double GetValidSLDistance(double requestedDistance) {
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   long stopLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minStopDistance = stopLevel * point;
   double spread = SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double buffer = 2.0 * GetPipSize();
   return MathMax(requestedDistance, MathMax((double)minStopDistance, spread) + buffer);
}

double CalculateActualSL(bool isBuy, double idealSL, double entryPrice) {
   double minDist = GetValidSLDistance(MathAbs(entryPrice - idealSL));
   if(isBuy) return MathMin(idealSL, entryPrice - minDist);
   else return MathMax(idealSL, entryPrice + minDist);
}

bool IsMarketExhausted() {
   double currentHigh = iHigh(_Symbol, PERIOD_CURRENT, 0);
   double currentLow = iLow(_Symbol, PERIOD_CURRENT, 0);
   double range = currentHigh - currentLow;
   if(range > currentATR * MaxCandleATR_Mult) return false;

   double closes[];
   ArraySetAsSeries(closes, true);
   if(CopyClose(_Symbol, PERIOD_CURRENT, 1, TrendLookback, closes) == TrendLookback) {
      int bearishCount = 0, bullishCount = 0;
      for(int i=0; i<TrendLookback; i++) {
         double open = iOpen(_Symbol, PERIOD_CURRENT, i+1);
         double close = closes[i];
         double body = MathAbs(close - open);
         if(body > currentATR * 0.6) {
            if(close < open) bearishCount++;
            else bullishCount++;
         }
      }
      if(bearishCount == TrendLookback || bullishCount == TrendLookback) return false;
   }
   return true;
}

void ManageOpenTrades(double bid, double ask, double pipSize, double point, int remaining) {
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(PositionSelectByTicket(ticket)) {
         if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == MagicNumber) {

            if(remaining <= CloseSecondsLeft) {
               trade.PositionClose(ticket);
               continue;
            }

            if(UseDynamicTrailing) {
               long posType = PositionGetInteger(POSITION_TYPE);
               double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
               double currentSL = PositionGetDouble(POSITION_SL);
               double currentTP = PositionGetDouble(POSITION_TP);

               if(posType == POSITION_TYPE_BUY) {
                  double profitPips = (bid - openPrice) / pipSize;
                  if(profitPips >= TrailActivationPips) {
                     double newSL = openPrice + (TrailStepPips * pipSize);
                     if(newSL > currentSL + point) trade.PositionModify(ticket, newSL, currentTP);
                  }
                  if(profitPips >= TrailActivationPips + TrailStepPips) {
                     double newSL = bid - (TrailStepPips * pipSize);
                     if(newSL > currentSL + point) trade.PositionModify(ticket, newSL, currentTP);
                  }
               }
               else if(posType == POSITION_TYPE_SELL) {
                  double profitPips = (openPrice - ask) / pipSize;
                  if(profitPips >= TrailActivationPips) {
                     double newSL = openPrice - (TrailStepPips * pipSize);
                     if(newSL < currentSL - point || currentSL == 0) trade.PositionModify(ticket, newSL, currentTP);
                  }
                  if(profitPips >= TrailActivationPips + TrailStepPips) {
                     double newSL = ask + (TrailStepPips * pipSize);
                     if(newSL < currentSL - point || currentSL == 0) trade.PositionModify(ticket, newSL, currentTP);
                  }
               }
            }
         }
      }
   }
}

void OnTick() {
   MqlDateTime timeNow;
   TimeCurrent(timeNow);

   if(timeNow.day != lastTrackedDay) {
      dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
      lastTrackedDay = timeNow.day;
      dailyLimitHit = false;
   }
   int currentWeekNum = timeNow.day_of_year / 7;
   if(currentWeekNum != lastTrackedWeek) {
      weekStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
      lastTrackedWeek = currentWeekNum;
      weeklyLimitHit = false;
   }

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double dailyDD = (dayStartBalance > 0) ? (dayStartBalance - equity) / dayStartBalance * 100.0 : 0;
   double weeklyDD = (weekStartBalance > 0) ? (weekStartBalance - equity) / weekStartBalance * 100.0 : 0;

   if(dailyDD >= MaxDailyDrawdown) dailyLimitHit = true;
   if(weeklyDD >= MaxWeeklyDrawdown) weeklyLimitHit = true;

   datetime currentCandleTime = iTime(_Symbol, PERIOD_CURRENT, 0);
   int      periodSeconds     = PeriodSeconds(PERIOD_CURRENT);
   datetime now               = TimeCurrent();
   int      elapsed           = (int)(now - currentCandleTime);
   int      remaining         = periodSeconds - elapsed;
   int      entryZoneStart    = periodSeconds / 3;

   double pipSize  = GetPipSize();
   double minWick  = MinWickPips * pipSize;
   double point    = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double bid      = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask      = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   ManageOpenTrades(bid, ask, pipSize, point, remaining);

   if(dailyLimitHit || weeklyLimitHit) return;

   if(currentCandleTime != lastCandleTime) {
      lastCandleTime         = currentCandleTime;
      tradeOpenedThisCandle  = false;
      candleOpenPrice        = iOpen(_Symbol, PERIOD_CURRENT, 0);
      prevCandleLow          = iLow(_Symbol, PERIOD_CURRENT, 1);
      prevCandleHigh         = iHigh(_Symbol, PERIOD_CURRENT, 1);

      double atr[];
      ArraySetAsSeries(atr, true);
      if(CopyBuffer(atrHandle, 0, 0, 1, atr) > 0) currentATR = atr[0];
      else currentATR = minWick * 2;

      sweepDownConfirmed = false;
      sweepUpConfirmed   = false;
      wickExtremeLow     = candleOpenPrice;
      wickExtremeHigh    = candleOpenPrice;
      return;
   }

   double currentLow  = iLow(_Symbol,  PERIOD_CURRENT, 0);
   double currentHigh = iHigh(_Symbol, PERIOD_CURRENT, 0);

   if(currentLow < wickExtremeLow) wickExtremeLow = currentLow;
   if(currentHigh > wickExtremeHigh) wickExtremeHigh = currentHigh;

   bool brokePrevLow = (currentLow < prevCandleLow);
   bool brokePrevHigh = (currentHigh > prevCandleHigh);
   bool internalDownWick = (candleOpenPrice - currentLow) >= minWick;
   bool internalUpWick = (currentHigh - candleOpenPrice) >= minWick;

   if(!sweepDownConfirmed && (brokePrevLow || internalDownWick)) sweepDownConfirmed = true;
   if(!sweepUpConfirmed && (brokePrevHigh || internalUpWick)) sweepUpConfirmed = true;

   if(elapsed >= entryZoneStart && remaining > CloseSecondsLeft && !tradeOpenedThisCandle) {

      if(IsMarketExhausted()) {
         bool buyTrigger = sweepDownConfirmed && bid >= candleOpenPrice && (!RequireLiquiditySweep || brokePrevLow);
         bool sellTrigger = sweepUpConfirmed && bid <= candleOpenPrice && (!RequireLiquiditySweep || brokePrevHigh);

         if(buyTrigger) {
            double idealSL = wickExtremeLow - (currentATR * ATR_SL_Multiplier);
            double actualSL = CalculateActualSL(true, idealSL, ask);
            OpenBuy(actualSL);
         }
         else if(sellTrigger) {
            double idealSL = wickExtremeHigh + (currentATR * ATR_SL_Multiplier);
            double actualSL = CalculateActualSL(false, idealSL, bid);
            OpenSell(actualSL);
         }
      }
   }
}

double GetLotSize(double slDistance) {
   double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
   double minLot   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   if(FixedLotSize > 0) return MathMax(minLot, MathMin(maxLot, FixedLotSize));

   double riskToUse = GetCurrentRisk();
   double riskAmt  = balance * (riskToUse / 100.0);

   double tickVal  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);

   if(slDistance <= 0 || tickVal <= 0 || tickSize <= 0) return minLot;

   double slTicks = slDistance / tickSize;
   double lots    = riskAmt / (slTicks * tickVal);

   lots = MathFloor(lots / lotStep) * lotStep;
   lots = MathMax(minLot, MathMin(maxLot, lots));

   double marginNeeded = 0;
   if(OrderCalcMargin(ORDER_TYPE_BUY, _Symbol, lots, SymbolInfoDouble(_Symbol, SYMBOL_ASK), marginNeeded)) {
      double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
      if(marginNeeded > freeMargin * 0.8) {
         lots = lots * (freeMargin * 0.8 / marginNeeded);
         lots = MathFloor(lots / lotStep) * lotStep;
         lots = MathMax(minLot, lots);
      }
   }
   return lots;
}

void OpenBuy(double sl) {
   double askNow = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double lots   = GetLotSize(MathAbs(askNow - sl));
   if(trade.Buy(lots, _Symbol, askNow, sl, 0, "WRB v7 BUY")) tradeOpenedThisCandle = true;
}

void OpenSell(double sl) {
   double bidNow = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double lots   = GetLotSize(MathAbs(bidNow - sl));
   if(trade.Sell(lots, _Symbol, bidNow, sl, 0, "WRB v7 SELL")) tradeOpenedThisCandle = true;
}

void DrawDashboard() {
   datetime currentCandleTime = iTime(_Symbol, PERIOD_CURRENT, 0);
   int      periodSeconds     = PeriodSeconds(PERIOD_CURRENT);
   int      elapsed           = (int)(TimeCurrent() - currentCandleTime);
   int      remaining         = periodSeconds - elapsed;
   if(remaining < 0) remaining = 0;

   string timeStr = (remaining >= 60) ? StringFormat("%d:%02d", remaining/60, remaining%60) : StringFormat("%ds", remaining);
   int entryZoneStart = periodSeconds / 3;

   if(ObjectFind(0, "WRB_Countdown") < 0) {
      ObjectCreate(0, "WRB_Countdown", OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, "WRB_Countdown", OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, "WRB_Countdown", OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, "WRB_Countdown", OBJPROP_YDISTANCE, 20);
      ObjectSetInteger(0, "WRB_Countdown", OBJPROP_FONTSIZE, 14);
      ObjectSetString(0, "WRB_Countdown", OBJPROP_FONT, "Arial Bold");
   }
   color clr = clrLimeGreen;
   if(elapsed >= entryZoneStart && remaining > CloseSecondsLeft) clr = clrOrange;
   if(remaining <= CloseSecondsLeft) clr = clrRed;
   if(elapsed < entryZoneStart) clr = clrDodgerBlue;
   ObjectSetString(0, "WRB_Countdown", OBJPROP_TEXT, "Candle closes: " + timeStr);
   ObjectSetInteger(0, "WRB_Countdown", OBJPROP_COLOR, clr);

   string status = "";
   if(dailyLimitHit) { status = "DAILY DD LIMIT HIT - TRADING PAUSED"; clr = clrRed; }
   else if(weeklyLimitHit) { status = "WEEKLY DD LIMIT HIT - TRADING PAUSED"; clr = clrRed; }
   else if(!IsMarketExhausted()) { status = "Market Exhausted - Paused"; clr = clrGray; }
   else if(tradeOpenedThisCandle) { status = "Trade Active | Managing..."; clr = clrAqua; }
   else { status = "Hunting Sweeps..."; }

   if(ObjectFind(0, "WRB_Status") < 0) {
      ObjectCreate(0, "WRB_Status", OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, "WRB_Status", OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, "WRB_Status", OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, "WRB_Status", OBJPROP_YDISTANCE, 45);
      ObjectSetInteger(0, "WRB_Status", OBJPROP_FONTSIZE, 11);
      ObjectSetString(0, "WRB_Status", OBJPROP_FONT, "Arial");
   }
   ObjectSetString(0, "WRB_Status", OBJPROP_TEXT, status);
   ObjectSetInteger(0, "WRB_Status", OBJPROP_COLOR, clr);

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double dailyDD = (dayStartBalance > 0) ? (dayStartBalance - equity) / dayStartBalance * 100.0 : 0;
   double weeklyDD = (weekStartBalance > 0) ? (weekStartBalance - equity) / weekStartBalance * 100.0 : 0;
   double currentRisk = GetCurrentRisk();

   string ddText = StringFormat("Risk: %.2f%% | Daily DD: %.2f%% / %.1f%% | Weekly DD: %.2f%% / %.1f%%",
                                currentRisk, dailyDD, MaxDailyDrawdown, weeklyDD, MaxWeeklyDrawdown);

   if(ObjectFind(0, "WRB_RiskDD") < 0) {
      ObjectCreate(0, "WRB_RiskDD", OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, "WRB_RiskDD", OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, "WRB_RiskDD", OBJPROP_XDISTANCE, 10);
      ObjectSetInteger(0, "WRB_RiskDD", OBJPROP_YDISTANCE, 65);
      ObjectSetInteger(0, "WRB_RiskDD", OBJPROP_FONTSIZE, 10);
      ObjectSetString(0, "WRB_RiskDD", OBJPROP_FONT, "Consolas");
   }

   color ddColor = clrLightGray;
   if(dailyDD > MaxDailyDrawdown * 0.7 || weeklyDD > MaxWeeklyDrawdown * 0.7) ddColor = clrOrange;
   if(dailyLimitHit || weeklyLimitHit) ddColor = clrRed;

   ObjectSetString(0, "WRB_RiskDD", OBJPROP_TEXT, ddText);
   ObjectSetInteger(0, "WRB_RiskDD", OBJPROP_COLOR, ddColor);

   ChartRedraw(0);
}
//+------------------------------------------------------------------+
