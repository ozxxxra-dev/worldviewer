# World Viewer — 金と世界情勢

金価格の値動きを中心に、その背景にある世界のニュース・地震・災害警報・為替を一望できる静的サイトです。

### 金相場
- **現在値**: 円/g・ドル/oz・ユーロ/oz を切り替え。前日比・1週間・1ヶ月・年初来・1年の騰落率、過去1年のレンジ内の位置、最高値からの乖離
- **価格の推移**: 1ヶ月〜全期間（2024年3月〜）のチャート。ホバーで日付ごとの値
- **円建て価格の変動要因**: 円建て金価格の変化を「ドル建て金価格の変化」と「為替（円安・円高）」に分解
- **関連指標**: 銀価格・金銀比価・ドル円
- **各国通貨建ての金価格**: 9通貨での価格・騰落率・最高値比
- **金関連ニュース**: Google ニュースの「金価格」検索と、一般ニュースのうち金・金利・インフレ関連の見出し

金価格の日次データは [fawazahmed0/currency-api](https://github.com/fawazahmed0/exchange-api)（毎日 npm に公開）から取得し、`public/data/gold-history.json` に蓄積します。国際価格をドル円で換算した値なので、国内の店頭価格（手数料・消費税込み）とは異なります。

### ニュースの翻訳と金関連度
- 海外ニュースの見出しを日本語に翻訳（「原文も表示」で英語の見出しと要約も確認可能）
- 各ニュースに金相場との関連度（高・中・低）と、金価格にとって上昇要因か下落要因かの推定、その理由を表示。関連度で色分け・絞り込み・並び替えができます
- 翻訳と判定は GitHub Actions 内で Claude API が行います（下記「Claude API の設定」）。API キーが無い場合は翻訳なしで、関連度だけキーワードで簡易判定します

### 世界情勢

- **世界地図**: 直近48時間のニュース見出しに登場した回数で国を色分け。地震（M4.5以上）と災害警報の位置も表示。国をクリックするとその国のニュースに絞り込み。
- **ニュース**: NHK 国際 / BBC / Al Jazeera / The Guardian / DW / NPR / UN News の RSS 見出し。キーワード・配信元で絞り込み可能。
- **地震**: USGS（過去7日・M4.5以上）
- **災害警報**: GDACS（熱帯低気圧・洪水・火山など）
- **為替**: 主要通貨の対米ドルレートと円換算（open.er-api.com）
- **世界時計**: 主要都市の現在時刻

## 仕組み

```
GitHub Actions（毎時）
  └ scripts/fetch-data.mjs が各データ源を取得 → public/data/snapshot.json
  └ scripts/update-gold.mjs が新しい日付の金価格を追記 → public/data/gold-history.json（変化があればコミット）
  └ public/ を GitHub Pages にデプロイ
ブラウザ
  └ public/index.html が snapshot.json を読み込んで描画（15分ごとに再読込）
```

ブラウザから各ニュースサイトに直接アクセスしない（CORS の制約を受けない・APIキー不要）ため、サーバーなしで運用できます。
ニュースの国分類は `public/data/countries.json` のキーワード照合による機械的なものです。

## 公開手順

1. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする
2. `main` に push するか、Actions タブから「Update data & deploy」を手動実行
3. 以後は毎時自動で更新されます（リポジトリに60日間 push がないと GitHub が定期実行を停止するので、その場合は Actions タブから再有効化してください）

## Claude API の設定（翻訳・関連度判定）

1. [Claude Console](https://console.anthropic.com/) で API キーを発行
2. リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で `ANTHROPIC_API_KEY` を登録

前回公開した翻訳結果はリンク単位で再利用し、Claude には新しく出た見出しだけを送ります（1回あたり最大200件）。
モデルは既定で `claude-opus-5-5`。費用を抑えたい場合は **Variables** に `CLAUDE_MODEL`（例: `claude-haiku-4-5`）を登録すると切り替えられます。

## ローカルで動かす

```sh
npm install
npm run dev        # サンプルデータで http://localhost:8080/ を起動（ネット接続不要）
npm run fetch      # 実データを取得して public/data/snapshot.json を更新
npm run gold       # 金価格の履歴に新しい日付を追記
npm test
```

## カスタマイズ

| やりたいこと | 編集する場所 |
| --- | --- |
| ニュースの配信元・金関連ニュースの検索語を変更 | `scripts/lib/sources.mjs` |
| 金関連度の判定基準・翻訳の指示 | `scripts/lib/enrich.mjs` の `SYSTEM`（キーワード判定は `TIERS`） |
| 国名の別名（「米国」「Kremlin」など）を追加 | `scripts/gen-countries.mjs` の `EXTRA` → `npm run gen:countries` |
| 表示する通貨 | `scripts/lib/snapshot.mjs` の `FX_CODES` |
| 世界時計の都市 | `public/js/app.js` の `CLOCKS` |
| 金価格の表示通貨 | `public/js/gold.js` の `CURRENCIES` |
