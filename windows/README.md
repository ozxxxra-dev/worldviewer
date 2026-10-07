# Windows VPS での設定（MT4 と同じ VPS で動かす）

VPS で1時間ごとに金相場のデータを取得し、EA が読むスコアファイルを MT4 の共通フォルダ
（`%APPDATA%\MetaQuotes\Terminal\Common\Files`）に置きます。公開ページは GitHub Pages のままなので、
ページの閲覧で VPS に負荷はかかりません。取得処理は約5秒・優先度「通常以下」で動くので、EA の処理が優先されます。

## 1. 準備（初回のみ）

1. **Node.js** をインストール: https://nodejs.org/ の LTS 版（v22 以降）
2. **Git** をインストール: https://git-scm.com/download/win
3. PowerShell を開き、リポジトリを取得:
   ```powershell
   cd $HOME
   git clone https://github.com/ozxxxra-dev/worldviewer.git
   cd worldviewer
   ```
4. 試しに1回実行（数十秒かかります）:
   ```powershell
   powershell -ExecutionPolicy Bypass -File windows\update.ps1
   Get-Content logs\update.log -Tail 20
   ```
   ログの最後が `=== 更新完了` で、共通フォルダに `gold-score.csv` と `score-history.csv` ができていれば成功です:
   ```powershell
   Get-ChildItem "$env:APPDATA\MetaQuotes\Terminal\Common\Files\*score*"
   ```

## 2. 定期実行の登録

MT4 を動かしているユーザーでログインした状態で:

```powershell
powershell -ExecutionPolicy Bypass -File windows\register-task.ps1            # 60分ごと
powershell -ExecutionPolicy Bypass -File windows\register-task.ps1 -Minutes 30 # 30分ごと（10分以上）
powershell -ExecutionPolicy Bypass -File windows\register-task.ps1 -Remove     # 解除
```

- 「ログオンしているときのみ実行」で登録されます。MT4 を常時動かす VPS ならそのままで大丈夫です。
- 動作状況はタスクスケジューラの `worldviewer-update` と `logs\update.log` で確認できます。

## 3. EA への組み込み

1. `mt4\GoldScore.mqh` を MT4 のデータフォルダの `MQL4\Include` にコピー
   （MT4 の「ファイル → データフォルダを開く」から開けます）
2. EA の先頭付近に `#include <GoldScore.mqh>` を追加
3. 新規注文の条件に追加:
   ```mql4
   if(買いの条件 && GoldScore_AllowBuy())  { /* OrderSend(...) */ }
   if(売りの条件 && GoldScore_AllowSell()) { /* OrderSend(...) */ }
   ```
4. コンパイルすると、EA のパラメーターに次が増えます

| パラメーター | 既定値 | 意味 |
| --- | --- | --- |
| GS_Enabled | true | フィルターを使うか（false で従来どおり） |
| GS_UseMacro | true | マクロ指標だけのスコアを使う（false で総合スコア）。検証結果は HANDOFF.md §4 |
| GS_Threshold | 30 | スコアが −30 以下で買い止め、+30 以上で売り止め |
| GS_MaxAgeHours | 48 | 本番でこれより古いスコアは「データなし」扱い |
| GS_AllowIfNoData | true | データなしのとき注文を許可するか |

- **ストラテジーテスター**では `score-history.csv` を読み、テスト中の日付の**前の営業日**のスコアを使います（先読みしません）。
  履歴は 2024年10月以降のみなので、それより前の期間はフィルターなし（GS_AllowIfNoData の設定どおり）になります。
- **本番**では `gold-score.csv` を5分に1回読み直します。ネット接続（WebRequest）は使いません。
