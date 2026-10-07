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

### 金相場の方向感（要因スコア）
金価格を動かしやすい指標それぞれに −2〜+2 点を付け、重みを掛けて合計し、−100〜+100 の総合スコアと「上昇優勢／中立／下落優勢」を表示します。

| 指標 | 出典 | 金にとって追い風 | 重み |
| --- | --- | --- | --- |
| 米国の実質金利（10年, DFII10） | FRED | 低下 | 2 |
| 広義ドル指数（DTWEXBGS） | FRED | ドル安 | 1.5 |
| 米2年金利（DGS2） | FRED | 低下（利下げ観測） | 1 |
| 期待インフレ率（10年, T10YIE） | FRED | 上昇 | 1 |
| 恐怖指数（VIX, VIXCLS） | FRED | 上昇 | 0.5 |
| 金価格のトレンド | 金価格の履歴 | 50日・200日平均より上 | 1.5 |
| 金関連ニュースの論調 | ニュース見出し | 上昇を伝える見出しが多い | 0.5 |

FRED の指標は「直近1ヶ月の変化 ÷ 過去3年の1ヶ月変化の標準偏差」が ±0.5 未満で 0 点、±1.5 未満で ±1 点、それ以上で ±2 点です。
将来の価格を予測するものではなく、追い風・向かい風の整理です。判定ルールは `scripts/lib/factors.mjs` で調整できます。

### 金相場の周辺情報
- **経済指標カレンダー**: 今週・来週の指標（Forex Factory の公開カレンダー）を日本時間で表示。次の米重要指標までの残り時間、国・重要度で絞り込み
- **値動きの荒さ**: 金のボラティリティ指数 GVZ（FRED: GVZCLS）と、金価格から計算した直近20営業日の実現変動率。過去3年の中での位置
- **投機筋のポジション**: CFTC 建玉明細（COMEX 金、マネージドマネー）の買い越し枚数、前週比、過去3年の中での位置

### ニュースの翻訳と金関連度
- 海外ニュースの見出しを日本語に翻訳（「原文も表示」で英語の見出しと要約も確認可能）
- 各ニュースに金相場との関連度（高・中・低）を見出しのキーワードで判定して表示。関連度で色分け・絞り込み・並び替えができます
- 翻訳は無料の2通り（下記「翻訳の設定」）。どちらも使えない環境では英語のまま表示します

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

## 翻訳の設定

| 方法 | 費用 | 設定 |
| --- | --- | --- |
| ブラウザ内蔵の翻訳（Chrome） | 無料 | 不要。パソコン版 Chrome で開くと「ブラウザ内で翻訳する」ボタンが出る |
| Microsoft Translator | 無料（月200万文字まで。超えると止まるだけで課金なし） | 下記（任意） |

Microsoft Translator を設定すると、自動更新のときに見出しを訳しておくので、スマホや他のブラウザでも日本語で表示されます。前回公開した訳はリンク単位で再利用し、新しく出た見出しだけを翻訳します。

1. [Azure](https://azure.microsoft.com/) のアカウントを作成し、「Translator」リソースを価格レベル **F0（Free）** で作成
2. リソースの「キーとエンドポイント」からキーと場所（例: `japaneast`）を確認
3. リポジトリの **Settings → Secrets and variables → Actions** で、Secret に `AZURE_TRANSLATOR_KEY`、Variable に `AZURE_TRANSLATOR_REGION` を登録

## MT4（Windows VPS）で使う

要因スコアを EA の方向フィルターに使う手順は [`windows/README.md`](windows/README.md)。

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
| 金関連度の判定キーワード | `scripts/lib/enrich.mjs` の `TIERS` |
| 国名の別名（「米国」「Kremlin」など）を追加 | `scripts/gen-countries.mjs` の `EXTRA` → `npm run gen:countries` |
| 表示する通貨 | `scripts/lib/snapshot.mjs` の `FX_CODES` |
| 世界時計の都市 | `public/js/app.js` の `CLOCKS` |
| 金価格の表示通貨 | `public/js/gold.js` の `CURRENCIES` |
