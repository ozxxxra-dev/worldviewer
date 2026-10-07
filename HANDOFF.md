# 引き継ぎメモ（2026-10-07 時点）

クラウド版 Claude Code で作ってきた作業の引き継ぎです。次の作業者（自宅の Claude Code）はまずこのファイルと `CLAUDE.md`、`README.md` を読んでください。

## 1. いまの状態

- **公開ページ**: https://ozxxxra-dev.github.io/worldviewer/ （GitHub Pages、リポジトリは public）
- **本番ブランチ**: `main`。`claude/world-dashboard` は作業用ブランチで、内容は main に取り込み済み。以後は main で作業してよい。
- **自動更新**: `.github/workflows/deploy.yml` が毎時（`7 * * * *`）＋ main への push で実行。データ取得 → GitHub Pages へデプロイ。
  - GitHub の schedule は実際には 4〜6 時間おきにしか動いていない。安定させるには外部 cron（cron-job.org）から `workflow_dispatch` を叩く案をユーザーに提示済み（手順は §6）。**ユーザーが設定したかは未確認。**
- テスト 21 件すべて成功（`npm test`）。

## 2. サイトの中身

| セクション | 内容 | 主なコード |
| --- | --- | --- |
| 金相場 | 現在値（円/g・ドル/oz・ユーロ/oz）、期間別騰落率、価格推移チャート、円建て価格の変動要因（金価格と為替に分解）、銀・金銀比価・ドル円、9通貨建て価格 | `public/js/gold.js` |
| 金相場の方向感（要因スコア） | 下の §3 | `scripts/lib/factors.mjs`, `public/js/gold.js` の `renderScore` |
| 金関連ニュース | Google ニュース検索 RSS（日英）＋一般ニュースから金・金利関連をキーワード抽出 | `scripts/lib/snapshot.mjs` |
| 世界情勢 | 世界地図（国別ニュース件数・地震・災害警報）、ニュース一覧（7社 RSS）、地震（USGS）、災害警報（GDACS）、為替 | `public/js/app.js` |
| ニュースの金関連度 | 見出しのキーワードで 高/中/低 を判定（`scripts/lib/enrich.mjs` の `TIERS`） | `public/js/news.js` |
| 翻訳 | 無料の手段のみ。Chrome 内蔵の Translator API（ブラウザ側）と、任意で Microsoft Translator 無料枠（`AZURE_TRANSLATOR_KEY`、未設定） | `public/js/news.js`, `scripts/lib/enrich.mjs` |

**ユーザーの方針**: 有料 API（Claude API 等）は使わない。翻訳も無料でないなら不要。

## 3. 要因スコアの仕組み（`scripts/lib/factors.mjs`）

| 指標 | FRED ID | 金に追い風 | 重み |
| --- | --- | --- | --- |
| 米国の実質金利（10年） | DFII10 | 低下 | 2 |
| 広義ドル指数 | DTWEXBGS | 低下 | 1.5 |
| 米2年金利（利下げ観測） | DGS2 | 低下 | 1 |
| 期待インフレ率（10年） | T10YIE | 上昇 | 1 |
| VIX | VIXCLS | 上昇 | 0.5 |
| 金価格のトレンド | （金価格の履歴） | 50・200 平均より上 | 1.5 |
| 金関連ニュースの論調 | （見出しの上昇語/下落語） | 上昇語が多い | 0.5 |

- FRED 指標: 直近21営業日の変化 ÷ 「評価日から過去3年の21日変化」の標準偏差 = z。|z|<0.5→0点、<1.5→±1、それ以上→±2。金にとっての向きに符号を合わせる。
- 合計 = Σ(点×重み) ÷ Σ(2×重み) × 100（−100〜+100）。取れなかった指標は分母から除外。
- 判定: ≥30 上昇優勢 / ≥10 やや上昇 / ≤−10 やや下落 / ≤−30 下落優勢 / それ以外 中立。
- FRED は登録不要の CSV `https://fred.stlouisfed.org/graph/fredgraph.csv?id=ID&cosd=YYYY-MM-DD` から5年分取得。
- **注意**: トレンド判定の「50日・200日平均」は金価格履歴の**暦日の件数**（週末を含む）で計算している。MT4 の日足とは揃っていない（75日線比較のほうは平日だけで計算している）。
- 2026-10-07 の値: **−78（下落優勢）**。実質金利・ドル・2年金利・トレンドがすべて −2。

## 4. 検証結果（75日線との比較）

`scripts/lib/backtest.mjs`。各営業日について、その日より前に公表されたデータだけでスコアを再計算（ニュース論調は過去分が無いので除外）。期間 2024-10-01〜2026-10-07、526 営業日。毎回の自動更新で `public/data/score-history.csv` と `score-backtest.json` を再生成して公開している（git には入れていない）。

| | 75日線との相関 | 方向を出した日の 75日線との一致率 |
| --- | --- | --- |
| 総合スコア | 0.66 | 89%（224日） |
| マクロのみ（FRED 5指標） | 0.46 | 69%（111日） |

その後20営業日の金の騰落（平均）:

| フィルター | 買い許可後 | 売り許可後 | 従った場合 | 的中 |
| --- | --- | --- | --- | --- |
| 75日線（終値 > MA75 で買い） | +2.5% | +0.6% | +1.8% | 62% |
| 総合スコア（±30） | +3.0% | +1.1% | +1.8% | 63% |
| マクロのみ（±30） | +3.3% | **−0.8%** | +1.7% | 63% |
| ずっと買い | | | +2.0% | |

**解釈（ユーザーに説明済み）**
- 総合スコアは 75日線とほぼ同じ判定で、置き換えても差は出ない。
- マクロのみスコアの「売り（買い止め）」判定は、75日線の売りより当たっていた。ただし売り判定は 76 日、独立した下落局面は数回しかなく、統計的に確かではない。
- 期間全体が金がほぼ倍になった強い上昇相場で、どのフィルターも「ずっと買い」に勝てていない。**期間が短く偏っているのが最大の弱点。**

## 5. 次にやること（ユーザーの希望）

ユーザーは MT4 を使用。**既存の EA に方向フィルターとして足したい**。自宅にゴールドの過去データがあり、そちらで検証を続けたい。

1. **長い期間での検証**（最優先）
   - 手元の金の過去データ（できれば 2010 年代〜、下落局面を含む）で `scoreHistory()` / `compareFilters()` を回す。`goldHistory` は `[{ d: 'YYYY-MM-DD', usd: 終値 }, ...]` の配列を渡せばよい（`scripts/lib/backtest.mjs`）。
   - FRED の取得期間を延ばす（`scripts/fetch-data.mjs` の `loadFred` は5年分。DFII10 は 2003 年〜、DTWEXBGS は 2006 年〜ある）。
   - 見たい点: マクロのみスコアを「買い止めフィルター」にしたとき、75日線単独より成績が良くなるか。下落・横ばい相場（例: 2013〜2015 年）での挙動。
   - しきい値（±30）や重みを過去データで最適化すると過剰最適化になりやすい。調整するなら期間を分けて確認すること。
2. **MT4 への組み込み**（部品は作成済み・**未コンパイル・未検証**）
   - ユーザーの VPS は **Windows**、MT4 と同じ VPS で動かす方針。手順は `windows/README.md`。
   - `windows/update.ps1`: git pull → 金価格履歴の更新 → データ取得 → `gold-score.csv`（最新値）と `score-history.csv`（各営業日）を MT4 の共通フォルダ `%APPDATA%\MetaQuotes\Terminal\Common\Files` にコピー。`windows/register-task.ps1` でタスクスケジューラに登録（優先度「通常以下」、既定60分ごと）。
   - `mt4/GoldScore.mqh`: `GoldScore_AllowBuy()` / `GoldScore_AllowSell()`。本番は `gold-score.csv`、テスターは `score-history.csv` の**前営業日**の値を使う（WebRequest は使わない）。既定はマクロのみスコアで ±30。
   - PowerShell と MQL4 はクラウド環境で実行・コンパイルできなかった。**最初に MetaEditor でコンパイルし、VPS で update.ps1 を手動実行して確認すること。**
   - ユーザーの既存 EA のエントリー条件の場所はまだ聞けていない。
3. **サイトに「マクロのみスコア」を表示**（未実装。`snapshot.factors.macro` と CSV には入っている）。
4. 自動更新の安定化（§6）をユーザーが設定したか確認する。

## 6. 運用メモ・落とし穴

- **main には自動コミットが入る**: ワークフローが `public/data/gold-history.json` に日次の金価格を追記してコミットする（`data: 金価格の履歴を更新`）。push 前に必ず `git pull`（rebase ではなく merge 推奨）。
- **金価格データの出典**: `@fawazahmed0/currency-api`（毎日 npm に日付版が公開される。jsDelivr → npm レジストリの順に取得）。国際価格をドル円で換算した値で、国内店頭価格（手数料・税込み）とは違う。銀は1日だけの異常値を除去している（`mergeHistory` の `removeSpikes`）。プラチナ・パラジウムはデータが荒いので除外。
- **生成物は git に入れない**: `public/vendor/`、`public/data/snapshot.json`、`score-history.csv`、`score-backtest.json`、`gold-score.csv`、`logs/` は `.gitignore` 済み。`gold-score.csv` は GitHub Pages でも公開される（`/data/gold-score.csv`）。ローカルでは `npm run build` と `npm run fetch`（ネット接続あり）または `npm run fetch:sample`（サンプルデータ）で作る。
- **サンプルデータ**: `test/fixtures/`。`fred-*.csv` は乱数で作った**架空の値**なので、検証には使わないこと。
- **外部 cron の手順（ユーザーに案内済み）**: GitHub の fine-grained token（このリポジトリのみ、Actions: Read and write）を作り、cron-job.org から毎時 `POST https://api.github.com/repos/ozxxxra-dev/worldviewer/actions/workflows/deploy.yml/dispatches`、ヘッダ `Authorization: Bearer <token>`・`Accept: application/vnd.github+json`、本文 `{"ref":"main"}`。成功時は 204。
- Actions のログに「Node.js 20 is deprecated」の警告が出ている（動作には影響なし）。`actions/*` を新しいメジャー版に上げれば消える。
- この内容は投資助言ではない、という立場でユーザーと話している。スコアは「追い風・向かい風の整理」であり予測ではないと説明済み。
