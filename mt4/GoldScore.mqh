//+------------------------------------------------------------------+
//| GoldScore.mqh                                                    |
//| worldviewer の金相場「要因スコア」を EA の方向フィルターに使う部品 |
//|                                                                  |
//| 使い方（既存 EA に追加）:                                        |
//|   1. このファイルを MQL4\Include にコピー                        |
//|   2. EA の先頭に  #include <GoldScore.mqh>                       |
//|   3. 新規注文の条件に GoldScore_AllowBuy() / AllowSell() を足す  |
//|        if(買いシグナル && GoldScore_AllowBuy())  OrderSend(...);  |
//|        if(売りシグナル && GoldScore_AllowSell()) OrderSend(...);  |
//|                                                                  |
//| 読むファイル（どちらも MT4 の共通フォルダ                        |
//|   %APPDATA%\MetaQuotes\Terminal\Common\Files に置く）:           |
//|   本番           gold-score.csv    … VPS の update.ps1 が毎時更新 |
//|   ストラテジー   score-history.csv … 各営業日のスコア            |
//|   テスター                                                        |
//+------------------------------------------------------------------+
#property strict

input string GS_Note          = "--- 金相場スコア フィルター ---";
input bool   GS_Enabled       = true;   // フィルターを使う
input bool   GS_UseMacro      = true;   // true: マクロ指標のみのスコア / false: 総合スコア
input int    GS_Threshold     = 30;     // この値以下で買い止め、マイナス値以上で売り止め
input int    GS_MaxAgeHours   = 48;     // 本番でこれより古いスコアは「データなし」扱い
input bool   GS_AllowIfNoData = true;   // データなし・古いときに注文を許可するか

#define GS_NONE -999

// ストラテジーテスター用の履歴（score-history.csv）
datetime gs_dates[];
int      gs_total[];
int      gs_macro[];
int      gs_count  = 0;
bool     gs_loaded = false;

// 本番用の最新値（gold-score.csv）。ファイルは5分に1回だけ読み直す
int      gs_liveTotal   = GS_NONE;
int      gs_liveMacro   = GS_NONE;
datetime gs_liveUpdated = 0;
datetime gs_liveReadAt  = 0;

int GS_ToInt(string s) { return (s == "") ? GS_NONE : (int)StringToInteger(s); }

//--- score-history.csv（date,score,macro,close,ma75）を読み込む
bool GS_LoadHistory()
{
   gs_loaded = true;
   int h = FileOpen("score-history.csv", FILE_READ | FILE_CSV | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ, ',');
   if(h == INVALID_HANDLE)
   {
      Print("GoldScore: score-history.csv を開けません（共通フォルダに置いてください） err=", GetLastError());
      return false;
   }
   for(int i = 0; i < 5 && !FileIsEnding(h); i++) FileReadString(h); // ヘッダ

   gs_count = 0;
   while(!FileIsEnding(h))
   {
      string d = FileReadString(h);
      string s = FileReadString(h);
      string m = FileReadString(h);
      FileReadString(h); // close
      FileReadString(h); // ma75
      if(d == "") continue;
      if(gs_count >= ArraySize(gs_dates))
      {
         int n = gs_count + 512;
         ArrayResize(gs_dates, n);
         ArrayResize(gs_total, n);
         ArrayResize(gs_macro, n);
      }
      gs_dates[gs_count] = StringToTime(d);
      gs_total[gs_count] = GS_ToInt(s);
      gs_macro[gs_count] = GS_ToInt(m);
      gs_count++;
   }
   FileClose(h);
   Print("GoldScore: 履歴 ", gs_count, " 日分を読み込みました");
   return gs_count > 0;
}

//--- テスター: 現在の日付より「前」の営業日のスコア（先読みしない）
int GS_FromHistory(datetime t)
{
   if(!gs_loaded) GS_LoadHistory();
   if(gs_count == 0) return GS_NONE;
   datetime day = t - (t % 86400);
   int lo = 0, hi = gs_count - 1, found = -1;
   while(lo <= hi)
   {
      int mid = (lo + hi) / 2;
      if(gs_dates[mid] < day) { found = mid; lo = mid + 1; }
      else hi = mid - 1;
   }
   if(found < 0) return GS_NONE;
   // 前の営業日のデータが7日以上前なら（履歴の範囲外）使わない
   if(day - gs_dates[found] > 7 * 86400) return GS_NONE;
   return GS_UseMacro ? gs_macro[found] : gs_total[found];
}

//--- 本番: gold-score.csv（date,score,macro,verdict,updated）を読む
int GS_FromLatest()
{
   if(TimeLocal() - gs_liveReadAt >= 300)
   {
      gs_liveReadAt = TimeLocal();
      int h = FileOpen("gold-score.csv", FILE_READ | FILE_CSV | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ, ',');
      if(h == INVALID_HANDLE)
      {
         Print("GoldScore: gold-score.csv を開けません err=", GetLastError());
         gs_liveTotal = GS_NONE;
         gs_liveMacro = GS_NONE;
      }
      else
      {
         for(int i = 0; i < 5 && !FileIsEnding(h); i++) FileReadString(h); // ヘッダ
         FileReadString(h);                                               // date
         gs_liveTotal   = GS_ToInt(FileReadString(h));
         gs_liveMacro   = GS_ToInt(FileReadString(h));
         FileReadString(h);                                               // verdict
         gs_liveUpdated = (datetime)StringToInteger(FileReadString(h));   // UNIX 秒（UTC）
         FileClose(h);
      }
   }
   if(gs_liveUpdated == 0 || TimeGMT() - gs_liveUpdated > GS_MaxAgeHours * 3600) return GS_NONE;
   return GS_UseMacro ? gs_liveMacro : gs_liveTotal;
}

//--- 現在のスコア（−100〜+100）。取れないときは GS_NONE
int GoldScore_Value()
{
   if(IsTesting() || IsOptimization()) return GS_FromHistory(TimeCurrent());
   return GS_FromLatest();
}

//--- +1: 上昇要因が優勢 / −1: 下落要因が優勢 / 0: 中立 / GS_NONE: データなし
int GoldScore_Direction()
{
   int v = GoldScore_Value();
   if(v == GS_NONE) return GS_NONE;
   if(v >= GS_Threshold)  return 1;
   if(v <= -GS_Threshold) return -1;
   return 0;
}

//--- 新規の買いを許可するか（下落要因が優勢なときだけ止める）
bool GoldScore_AllowBuy()
{
   if(!GS_Enabled) return true;
   int d = GoldScore_Direction();
   if(d == GS_NONE) return GS_AllowIfNoData;
   return d >= 0;
}

//--- 新規の売りを許可するか（上昇要因が優勢なときだけ止める）
bool GoldScore_AllowSell()
{
   if(!GS_Enabled) return true;
   int d = GoldScore_Direction();
   if(d == GS_NONE) return GS_AllowIfNoData;
   return d <= 0;
}
//+------------------------------------------------------------------+
