# worldviewer

金相場を中心に世界情勢を一望する静的サイト（GitHub Pages）。経緯・検証結果・次の作業は `HANDOFF.md` を必ず読むこと。

## コマンド

- `npm install` → `npm run dev`: サンプルデータで http://localhost:8080/ を起動（ネット不要）
- `npm run fetch`: 実データを取得して `public/data/snapshot.json`・`score-history.csv`・`score-backtest.json` を生成
- `npm run gold`: 金価格の日次履歴 `public/data/gold-history.json` に新しい日付を追記
- `npm test`: `node --test`（テストは `test/`、サンプルは `test/fixtures/`）

## 構成

- `scripts/`（Node, ESM）: データ取得と加工。`lib/snapshot.mjs` ニュース・地震・災害・為替、`lib/gold.mjs` 金価格履歴、`lib/factors.mjs` 要因スコア、`lib/backtest.mjs` 過去スコアと75日線比較、`lib/enrich.mjs` 金関連度・無料翻訳
- `public/`: そのまま配信する静的ファイル。ビルド工程なし（`npm run build` は d3 などを `public/vendor/` にコピーするだけ）
- `.github/workflows/deploy.yml`: 毎時＋main への push でデータ取得 → Pages デプロイ。`gold-history.json` を自動コミットするので、push 前に `git pull` する

## 方針

- 有料 API は使わない（ユーザーの希望）。データ源は登録不要・無料のものだけ
- コメントと UI の文言は日本語。既存コードの書き方（小さな DOM ビルダー `h()`、CSS トークン、ダークモード対応）に合わせる
- データ取得は1つの取得元が失敗しても全体を止めない（`status` に記録して続行）
