# World Viewer — 世界情勢ダッシュボード

世界のニュース・地震・災害警報・為替を、1枚の世界地図とパネルで一望できる静的サイトです。

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

## ローカルで動かす

```sh
npm install
npm run dev        # サンプルデータで http://localhost:8080/ を起動（ネット接続不要）
npm run fetch      # 実データを取得して public/data/snapshot.json を更新
npm test
```

## カスタマイズ

| やりたいこと | 編集する場所 |
| --- | --- |
| ニュースの配信元を追加・削除 | `scripts/lib/sources.mjs` |
| 国名の別名（「米国」「Kremlin」など）を追加 | `scripts/gen-countries.mjs` の `EXTRA` → `npm run gen:countries` |
| 表示する通貨 | `scripts/lib/snapshot.mjs` の `FX_CODES` |
| 世界時計の都市 | `public/js/app.js` の `CLOCKS` |
