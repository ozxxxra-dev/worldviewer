// 取得元の一覧。追加・削除はここだけ編集すればよい。
export const NEWS_SOURCES = [
  { id: 'nhk', name: 'NHK 国際', lang: 'ja', url: 'https://www3.nhk.or.jp/rss/news/cat6.xml' },
  { id: 'bbc', name: 'BBC World', lang: 'en', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'aljazeera', name: 'Al Jazeera', lang: 'en', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'guardian', name: 'The Guardian', lang: 'en', url: 'https://www.theguardian.com/world/rss' },
  { id: 'dw', name: 'DW', lang: 'en', url: 'https://rss.dw.com/rdf/rss-en-world' },
  { id: 'npr', name: 'NPR World', lang: 'en', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'un', name: 'UN News', lang: 'en', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
];

export const QUAKE_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
export const GDACS_URL = 'https://www.gdacs.org/xml/rss.xml';
export const FX_URL = 'https://open.er-api.com/v6/latest/USD';

// 金関連ニュース（Google ニュースの検索 RSS）
const gnews = (q, lang) =>
  lang === 'ja'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ja&gl=JP&ceid=JP:ja`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
export const GOLD_NEWS_SOURCES = [
  { id: 'gnews-gold-ja', name: 'Google ニュース「金価格」', lang: 'ja', url: gnews('金価格 OR 金相場 when:2d', 'ja') },
  { id: 'gnews-gold-en', name: 'Google News "gold price"', lang: 'en', url: gnews('"gold price" OR "gold prices" OR bullion when:2d', 'en') },
];

// 一般ニュースのうち金相場に関係しそうな見出しを拾うキーワード
export const GOLD_KEYWORDS = /\bgold\b|bullion|金価格|金相場|金先物|金地金|安全資産|precious metal|貴金属|\bFed\b|FRB|利下げ|利上げ|rate cut|rate hike|inflation|インフレ|central bank|中央銀行/i;

// 現在値（任意・1時間ごと）。失敗しても日次データで表示は続く
export const GOLD_SPOT_URL = 'https://api.gold-api.com/price/XAU';
