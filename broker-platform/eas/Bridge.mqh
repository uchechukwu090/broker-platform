//+------------------------------------------------------------------+
//|                                                          Bridge.mqh |
//|                                    Copyright 2025, Broker Platform |
//|                  Shared REST bridge helpers for the MQL5 EAs.     |
//+------------------------------------------------------------------+
//|  Shared include for the SignalExecutor EA and the WickReversalBot |
//|  Bridge EA. Do NOT duplicate these helpers in either EA.          |
//|                                                                   |
//|  Provides:                                                        |
//|    1. HMAC-SHA256 sign/verify (via mql5 standard library).        |
//|    2. HTTP POST/GET helpers (WebRequest).                         |
//|    3. JSON encode helpers for trade events.                       |
//|                                                                   |
//|  WebRequest allowlist requirement (must be done by the user):    |
//|    Tools -> Options -> Expert Advisors ->                         |
//|    "Allow WebRequest for listed URL" -> add your API base URL.    |
//+------------------------------------------------------------------+
#ifndef BRIDGE_MQH_INCLUDED
#define BRIDGE_MQH_INCLUDED

#include <Trade/Trade.mqh>
#include <Crypto/Hash.mqh>   // mql5 standard library - HMAC-SHA256

//-------------------------------------------------------------------+
// HTTP status / error codes used by the bridge.                     |
//-------------------------------------------------------------------+
#define BRIDGE_OK                  0
#define BRIDGE_ERR_NETWORK       -1
#define BRIDGE_ERR_HTTP_4XX      -2
#define BRIDGE_ERR_HTTP_5XX      -3
#define BRIDGE_ERR_AUTH          -4
#define BRIDGE_ERR_TIMEOUT       -5
#define BRIDGE_ERR_PARSE         -6
#define BRIDGE_ERR_REQ           -7

//-------------------------------------------------------------------+
// WebRequest timeout in milliseconds (per attempt).                 |
//-------------------------------------------------------------------+
#define BRIDGE_HTTP_TIMEOUT_MS   5000
#define BRIDGE_HTTP_RETRY_MAX    3
#define BRIDGE_RETRY_BASE_MS     1000

//+------------------------------------------------------------------+
//| Escape a string for inclusion in a JSON value.                    |
//+------------------------------------------------------------------+
string BRG_JsonEscape(string s)
{
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; ++i)
   {
      ushort ch = StringGetCharacter(s, i);
      switch(ch)
      {
         case '"':  out += "\\\""; break;
         case '\\': out += "\\\\"; break;
         case '\b': out += "\\b";  break;
         case '\f': out += "\\f";  break;
         case '\n': out += "\\n";  break;
         case '\r': out += "\\r";  break;
         case '\t': out += "\\t";  break;
         default:
            if(ch < 0x20)
               out += StringFormat("\\u%04x", ch);
            else
               out += ShortToString(ch);
            break;
      }
   }
   return out;
}

//+------------------------------------------------------------------+
//| Format a double with a fixed number of decimals (no scientific). |
//+------------------------------------------------------------------+
string BRG_JsonNum(double v, int digits = 8)
{
   return DoubleToString(v, digits);
}

//+------------------------------------------------------------------+
//| Build a JSON object string for a trade-opened event.             |
//|                                                                    |
//|   {pool, ticket, symbol, type, lotSize, openPrice, sl, tp,        |
//|    eaSource}                                                       |
//+------------------------------------------------------------------+
string BRG_JsonTradeOpened(const string pool,
                           const ulong  ticket,
                           const string symbol,
                           const string type,
                           const double lotSize,
                           const double openPrice,
                           const double sl,
                           const double tp,
                           const string eaSource)
{
   string s = "{";
   s += "\"pool\":\""        + BRG_JsonEscape(pool)      + "\",";
   s += "\"ticket\":"        + BRG_JsonNum((double)ticket, 0) + ",";
   s += "\"symbol\":\""      + BRG_JsonEscape(symbol)    + "\",";
   s += "\"type\":\""        + BRG_JsonEscape(type)      + "\",";
   s += "\"lotSize\":"       + BRG_JsonNum(lotSize, 8)   + ",";
   s += "\"openPrice\":"     + BRG_JsonNum(openPrice, 8) + ",";
   s += "\"sl\":"            + BRG_JsonNum(sl, 8)        + ",";
   s += "\"tp\":"            + BRG_JsonNum(tp, 8)        + ",";
   s += "\"eaSource\":\""    + BRG_JsonEscape(eaSource)  + "\"";
   s += "}";
   return s;
}

//+------------------------------------------------------------------+
//| Build a JSON object string for a trade-closed event.             |
//|                                                                    |
//|   {pool, ticket, closePrice, pnl, closedAt}                       |
//+------------------------------------------------------------------+
string BRG_JsonTradeClosed(const string pool,
                           const ulong  ticket,
                           const double closePrice,
                           const double pnl,
                           const datetime closedAt)
{
   string s = "{";
   s += "\"pool\":\""      + BRG_JsonEscape(pool)     + "\",";
   s += "\"ticket\":"      + BRG_JsonNum((double)ticket, 0) + ",";
   s += "\"closePrice\":"  + BRG_JsonNum(closePrice, 8)+ ",";
   s += "\"pnl\":"         + BRG_JsonNum(pnl, 8)      + ",";
   s += "\"closedAt\":\""  + TimeToString(closedAt, TIME_DATE|TIME_SECONDS) + "\"";
   s += "}";
   return s;
}

//+------------------------------------------------------------------+
//| HMAC-SHA256: returns lowercase hex of the MAC.                   |
//|   Uses mql5 standard library (Crypto/Hash.mqh).                  |
//+------------------------------------------------------------------+
string BRG_HmacSha256Hex(const string secret, const string message)
{
   uchar key[];
   uchar msg[];
   uchar mac[];

   StringToCharArray(secret, key, 0, WHOLE_ARRAY, CP_UTF8);
   StringToCharArray(message, msg, 0, WHOLE_ARRAY, CP_UTF8);

   // Trim trailing zero byte (WHOLE_ARRAY keeps the NUL).
   int keyLen = ArraySize(key);
   if(keyLen > 0 && key[keyLen-1] == 0) ArrayResize(key, keyLen-1);
   int msgLen = ArraySize(msg);
   if(msgLen > 0 && msg[msgLen-1] == 0) ArrayResize(msg, msgLen-1);

   // HMAC-SHA256 block size = 64 bytes
   const int B = 64;
   uchar kpad[];
   ArrayResize(kpad, B);
   ArrayFill(kpad, 0, B, 0);
   if(ArraySize(key) > B)
   {
      uchar kh[];
      HashSha256(key, kh);
      ArrayCopy(kpad, kh, 0, 0, MathMin(ArraySize(kh), B));
   }
   else
   {
      ArrayCopy(kpad, key, 0, 0, ArraySize(key));
   }

   uchar ipad[];
   uchar opad[];
   ArrayResize(ipad, B);
   ArrayResize(opad, B);
   for(int i = 0; i < B; ++i)
   {
      ipad[i] = (uchar)(kpad[i] ^ 0x36);
      opad[i] = (uchar)(kpad[i] ^ 0x5C);
   }

   uchar inner[];
   ArrayCopy(inner, ipad, 0, 0, B);
   ArrayCopy(inner, msg, B, 0, ArraySize(msg));
   uchar innerHash[];
   HashSha256(inner, innerHash);

   uchar outer[];
   ArrayCopy(outer, opad, 0, 0, B);
   ArrayCopy(outer, innerHash, B, 0, ArraySize(innerHash));
   uchar finalHash[];
   HashSha256(outer, finalHash);

   // Hex-encode (lowercase).
   string hex = "";
   for(int i = 0; i < ArraySize(finalHash); ++i)
   {
      uchar b = finalHash[i];
      hex += StringFormat("%02x", (uint)b);
   }
   return hex;
}

//+------------------------------------------------------------------+
//| Generic HTTP POST with HMAC signature.                            |
//|   url      - full URL (https://host:port/path?q=v)                |
//|   body     - request body (string)                                |
//|   secret   - HMAC secret                                          |
//|   response - server response text (out)                            |
//|   httpCode - HTTP status code (out)                               |
//|   Returns BRIDGE_OK or one of the BRIDGE_ERR_* codes.            |
//|                                                                    |
//|   IMPORTANT: You must whitelist the URL in:                       |
//|     Tools -> Options -> Expert Advisors ->                        |
//|     "Allow WebRequest for listed URL".                            |
//+------------------------------------------------------------------+
int BRG_HttpPost(const string url,
                 const string body,
                 const string secret,
                 string &response,
                 int &httpCode)
{
   response = "";
   httpCode = 0;

   // Build headers
   string headers = "Content-Type: application/json\r\n";
   headers += "X-Signature: " + BRG_HmacSha256Hex(secret, body) + "\r\n";

   char postData[];
   StringToCharArray(body, postData, 0, WHOLE_ARRAY, CP_UTF8);
   int dataLen = ArraySize(postData);
   if(dataLen > 0 && postData[dataLen-1] == 0) { ArrayResize(postData, dataLen-1); dataLen--; }

   char respData[];
   string respHeaders;

   int lastErr = 0;
   for(int attempt = 0; attempt < BRIDGE_HTTP_RETRY_MAX; ++attempt)
   {
      ResetLastError();
      httpCode = WebRequest("POST", url, headers, BRIDGE_HTTP_TIMEOUT_MS,
                            postData, respData, respHeaders);
      lastErr = GetLastError();
      if(httpCode > 0) break;        // success
      if(attempt < BRIDGE_HTTP_RETRY_MAX - 1)
         Sleep(BRIDGE_RETRY_BASE_MS * (1 << attempt));
   }

   if(httpCode <= 0)
   {
      PrintFormat("BRG_HttpPost: WebRequest failed url=%s err=%d", url, lastErr);
      return BRIDGE_ERR_NETWORK;
   }

   response = CharArrayToString(respData, 0, WHOLE_ARRAY, CP_UTF8);

   if(httpCode == 401 || httpCode == 403) return BRIDGE_ERR_AUTH;
   if(httpCode >= 500) return BRIDGE_ERR_HTTP_5XX;
   if(httpCode >= 400) return BRIDGE_ERR_HTTP_4XX;
   return BRIDGE_OK;
}

//+------------------------------------------------------------------+
//| Generic HTTP GET with HMAC signature.                             |
//|   The signed payload is the path-and-query portion of the URL.   |
//+------------------------------------------------------------------+
int BRG_HttpGet(const string url,
                const string secret,
                string &response,
                int &httpCode)
{
   response = "";
   httpCode = 0;

   // Extract path+query for the signature (everything after the host).
   string pathAndQuery = url;
   int idx = StringFind(url, "://");
   if(idx >= 0)
   {
      int slash = StringFind(url, "/", idx + 3);
      if(slash >= 0) pathAndQuery = StringSubstr(url, slash);
      else           pathAndQuery = "/";
   }

   string headers = "X-Signature: " + BRG_HmacSha256Hex(secret, pathAndQuery) + "\r\n";

   char respData[];
   string respHeaders;
   int lastErr = 0;

   for(int attempt = 0; attempt < BRIDGE_HTTP_RETRY_MAX; ++attempt)
   {
      ResetLastError();
      httpCode = WebRequest("GET", url, headers, BRIDGE_HTTP_TIMEOUT_MS,
                            NULL, respData, respHeaders);
      lastErr = GetLastError();
      if(httpCode > 0) break;
      if(attempt < BRIDGE_HTTP_RETRY_MAX - 1)
         Sleep(BRIDGE_RETRY_BASE_MS * (1 << attempt));
   }

   if(httpCode <= 0)
   {
      PrintFormat("BRG_HttpGet: WebRequest failed url=%s err=%d", url, lastErr);
      return BRIDGE_ERR_NETWORK;
   }

   response = CharArrayToString(respData, 0, WHOLE_ARRAY, CP_UTF8);

   if(httpCode == 401 || httpCode == 403) return BRIDGE_ERR_AUTH;
   if(httpCode >= 500) return BRIDGE_ERR_HTTP_5XX;
   if(httpCode >= 400) return BRIDGE_ERR_HTTP_4XX;
   return BRIDGE_OK;
}

//+------------------------------------------------------------------+
//| Heuristic check: does the response JSON contain a "paused" key?   |
//|   For the /api/v1/investments/status endpoint the server returns  |
//|   a JSON array. We just substring-scan for safety.               |
//+------------------------------------------------------------------+
bool BRG_AnyInvestmentPaused(const string &jsonResponse)
{
   if(StringLen(jsonResponse) == 0) return false;
   // Look for the literal token "paused" or "status":"paused"
   string lc = jsonResponse;
   StringToLower(lc);
   if(StringFind(lc, "\"status\":\"paused\"") >= 0) return true;
   if(StringFind(lc, "\"paused\":true") >= 0)       return true;
   return false;
}

//+------------------------------------------------------------------+
//| Extract a numeric value for a JSON key (very small helper).      |
//|   Used by the bridge for things like reading the close price     |
//|   back from a server ack. Best-effort only.                      |
//+------------------------------------------------------------------+
double BRG_JsonGetNumber(const string &json, const string key, const double fallback = 0.0)
{
   string needle = "\"" + key + "\"";
   int p = StringFind(json, needle);
   if(p < 0) return fallback;
   int colon = StringFind(json, ":", p + StringLen(needle));
   if(colon < 0) return fallback;
   string tail = StringSubstr(json, colon + 1);
   int end = 0;
   int tlen = StringLen(tail);
   while(end < tlen)
   {
      ushort ch = StringGetCharacter(tail, end);
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == 'e' || ch == 'E' || ch == '+')
         ++end;
      else
         break;
   }
   if(end == 0) return fallback;
   return StringToDouble(StringSubstr(tail, 0, end));
}

#endif // BRIDGE_MQH_INCLUDED
//+------------------------------------------------------------------+
