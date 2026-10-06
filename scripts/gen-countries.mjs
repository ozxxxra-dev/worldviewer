// world-atlas の国 ID (ISO 3166-1 numeric) と国名・検索用キーワードの対応表を生成する。
// 出力は public/data/countries.json としてコミットする（国の追加・別名の調整時のみ再実行）。
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const countries = require('i18n-iso-countries');
countries.registerLocale(require('i18n-iso-countries/langs/ja.json'));
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));
const atlas = require('world-atlas/countries-110m.json');

// 見出しでよく使われる通称（日本語は部分一致、英語は単語境界で一致）
const EXTRA = {
  US: { ja: ['アメリカ', '米国', '米政府', '米大統領', '米軍'], en: ['America', 'Washington', 'White House', 'Pentagon'] },
  GB: { ja: ['英国', '英政府'], en: ['Britain', 'UK', 'U.K.', 'London'] },
  CN: { ja: ['中国', '北京', '習近平'], en: ['Beijing', 'Chinese'] },
  RU: { ja: ['ロシア', '露', 'プーチン', 'モスクワ'], en: ['Russian', 'Moscow', 'Kremlin', 'Putin'] },
  KR: { ja: ['韓国', 'ソウル'], en: ['South Korea', 'Seoul'] },
  KP: { ja: ['北朝鮮', '平壌'], en: ['North Korea', 'Pyongyang'] },
  JP: { ja: ['日本', '東京', '政府'], en: ['Japanese', 'Tokyo'] },
  TW: { ja: ['台湾', '台北'], en: ['Taiwanese', 'Taipei'] },
  UA: { ja: ['ウクライナ', 'キーウ'], en: ['Ukrainian', 'Kyiv', 'Kiev'] },
  IL: { ja: ['イスラエル'], en: ['Israeli', 'Netanyahu'] },
  PS: { ja: ['パレスチナ', 'ガザ', 'ヨルダン川西岸'], en: ['Gaza', 'Palestinian', 'West Bank', 'Hamas'] },
  IR: { ja: ['イラン', 'テヘラン'], en: ['Iranian', 'Tehran'] },
  IN: { ja: ['インド'], en: ['Indian', 'New Delhi', 'Modi'] },
  DE: { ja: ['ドイツ'], en: ['German', 'Berlin'] },
  FR: { ja: ['フランス'], en: ['French', 'Paris'] },
  SY: { ja: ['シリア'], en: ['Syrian', 'Damascus'] },
  SD: { ja: ['スーダン'], en: ['Sudanese', 'Khartoum'] },
  SS: { ja: ['南スーダン'], en: ['South Sudan'] },
  CD: { ja: ['コンゴ民主共和国'], en: ['DR Congo', 'DRC', 'Kinshasa'] },
  CG: { ja: ['コンゴ共和国'], en: ['Republic of the Congo', 'Brazzaville'] },
  VE: { ja: ['ベネズエラ'], en: ['Venezuelan', 'Caracas'] },
  MX: { ja: ['メキシコ'], en: ['Mexican'] },
  BR: { ja: ['ブラジル'], en: ['Brazilian'] },
  SA: { ja: ['サウジ'], en: ['Saudi'] },
  AE: { ja: ['UAE', 'アラブ首長国連邦', 'ドバイ'], en: ['UAE', 'Emirati', 'Dubai', 'Abu Dhabi'] },
  TR: { ja: ['トルコ', 'トルキエ'], en: ['Turkish', 'Turkiye', 'Türkiye', 'Ankara', 'Erdogan'] },
  AF: { ja: ['アフガニスタン', 'タリバン'], en: ['Afghan', 'Taliban', 'Kabul'] },
  PK: { ja: ['パキスタン'], en: ['Pakistani', 'Islamabad'] },
  MM: { ja: ['ミャンマー'], en: ['Myanmar', 'Burma'] },
  PH: { ja: ['フィリピン', 'マニラ'], en: ['Philippine', 'Filipino', 'Manila'] },
  VN: { ja: ['ベトナム'], en: ['Vietnamese', 'Hanoi'] },
  CZ: { ja: ['チェコ'], en: ['Czech'] },
  NL: { ja: ['オランダ'], en: ['Dutch', 'Netherlands'] },
};

// 誤検出が多い語（「政府」「米」など一文字・一般語）は除外する
const STOP = new Set(['政府', '露', 'US']);

const features = atlas.objects.countries.geometries;
const out = {};
for (const g of features) {
  const name = g.properties.name;
  if (!g.id) {
    // 未承認地域（Kosovo 等）は名前をキーにする
    out[name] = { a2: null, en: name, ja: { Kosovo: 'コソボ', 'N. Cyprus': '北キプロス', Somaliland: 'ソマリランド' }[name] ?? name, kw: { ja: [], en: [name] } };
    continue;
  }
  const a2 = countries.numericToAlpha2(g.id);
  const extra = EXTRA[a2] ?? { ja: [], en: [] };
  // 表示名は通称を優先（例: 大韓民国 → 韓国）
  const ja = extra.ja[0] ?? countries.getName(a2, 'ja', { select: 'official' });
  const jaAll = countries.getName(a2, 'ja', { select: 'all' }) ?? [];
  const enAll = countries.getName(a2, 'en', { select: 'all' }) ?? [];
  const en = name;
  const uniq = (xs) => [...new Set(xs)].filter((x) => x && !STOP.has(x));
  out[g.id] = {
    a2,
    en,
    ja,
    kw: {
      ja: uniq([...jaAll, ...extra.ja]),
      // 2文字以下の英略語は誤検出しやすいので除外（UK/UAE等は EXTRA から明示）
      en: uniq([...enAll.filter((x) => x.replace(/\./g, '').length > 3), ...extra.en]),
    },
  };
}
writeFileSync(new URL('../public/data/countries.json', import.meta.url), JSON.stringify(out, null, 0) + '\n');
console.log(`wrote ${Object.keys(out).length} countries`);
