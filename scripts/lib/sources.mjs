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
