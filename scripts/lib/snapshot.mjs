import { parseFeed } from './parse.mjs';
import { makeTagger } from './tagger.mjs';
import { NEWS_SOURCES, GOLD_NEWS_SOURCES, GOLD_KEYWORDS, GOLD_SPOT_URL, QUAKE_URL, GDACS_URL, FX_URL } from './sources.mjs';

const NEWS_MAX_AGE_H = 48;
const NEWS_LIMIT = 400;
const FX_CODES = ['JPY', 'EUR', 'GBP', 'CNY', 'KRW', 'INR', 'RUB', 'BRL', 'CHF', 'AUD', 'CAD', 'TRY'];

/**
 * 全データ源を取得して1つのスナップショットにまとめる。
 * get(kind, source) は文字列（XML/JSON本文）を返す関数。個々の失敗は記録して続行する。
 */
export async function buildSnapshot({ get, countries, now = new Date() }) {
  const tag = makeTagger(countries);
  const status = [];

  const settle = async (id, name, fn) => {
    try {
      const r = await fn();
      status.push({ id, name, ok: true, count: Array.isArray(r) ? r.length : undefined });
      return r;
    } catch (e) {
      status.push({ id, name, ok: false, error: String(e?.message ?? e).slice(0, 200) });
      return null;
    }
  };

  const cutoff = now.getTime() - NEWS_MAX_AGE_H * 3600e3;
  const newsLists = await Promise.all(
    NEWS_SOURCES.map((src) =>
      settle(src.id, src.name, async () =>
        parseFeed(await get('news', src)).map((it) => ({
          title: it.title,
          link: it.link,
          date: it.date,
          summary: it.summary,
          source: src.id,
          lang: src.lang,
          countries: tag(`${it.title} ${it.summary}`),
        })),
      ),
    ),
  );

  const seen = new Set();
  const news = newsLists
    .flat()
    .filter(Boolean)
    .filter((n) => !n.date || Date.parse(n.date) >= cutoff)
    .filter((n) => (seen.has(n.link) ? false : seen.add(n.link)))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, NEWS_LIMIT);

  const countryCounts = {};
  for (const n of news) for (const c of n.countries) countryCounts[c] = (countryCounts[c] ?? 0) + 1;

  const quakes =
    (await settle('usgs', 'USGS 地震', async () => {
      const gj = JSON.parse(await get('quakes', { id: 'usgs', url: QUAKE_URL }));
      return gj.features.map((f) => ({
        mag: f.properties.mag,
        place: f.properties.place,
        time: new Date(f.properties.time).toISOString(),
        url: f.properties.url,
        tsunami: !!f.properties.tsunami,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        depth: f.geometry.coordinates[2],
      }));
    })) ?? [];
  quakes.sort((a, b) => b.time.localeCompare(a.time));

  const disasters =
    (await settle('gdacs', 'GDACS 災害警報', async () =>
      parseFeed(await get('disasters', { id: 'gdacs', url: GDACS_URL }))
        .map((it) => ({
          title: it.title,
          link: it.link,
          date: it.date,
          type: String(it.raw['gdacs:eventtype'] ?? ''),
          alert: String(it.raw['gdacs:alertlevel'] ?? '').toLowerCase(),
          country: String(it.raw['gdacs:country'] ?? ''),
          lat: Number.isFinite(it.lat) ? it.lat : null,
          lon: Number.isFinite(it.lon) ? it.lon : null,
        }))
        .filter((d) => d.type !== 'EQ'), // 地震は USGS 側で表示する
    )) ?? [];

  const fx = await settle('fx', '為替レート', async () => {
    const j = JSON.parse(await get('fx', { id: 'fx', url: FX_URL }));
    if (j.result !== 'success') throw new Error(`fx api: ${j.result}`);
    return {
      base: j.base_code,
      updated: new Date(j.time_last_update_unix * 1000).toISOString(),
      rates: Object.fromEntries(FX_CODES.filter((c) => c in j.rates).map((c) => [c, j.rates[c]])),
    };
  });

  // 金関連ニュース: 専用の検索フィードと、一般ニュースのうちキーワードに一致するもの
  const goldLists = await Promise.all(
    GOLD_NEWS_SOURCES.map((src) =>
      settle(src.id, src.name, async () =>
        parseFeed(await get('news', src)).map((it) => ({
          title: it.title,
          link: it.link,
          date: it.date,
          source: src.id,
          // Google ニュースは見出し末尾が「 - 媒体名」
          publisher: String(it.raw.source?.['#text'] ?? it.raw.source ?? '') || null,
          lang: src.lang,
        })),
      ),
    ),
  );
  const goldSeen = new Set();
  const goldTitleKey = (t) => t.replace(/\s+-\s+[^-]+$/, '').toLowerCase();
  const goldNews = [
    ...goldLists.flat().filter(Boolean),
    ...news.filter((n) => GOLD_KEYWORDS.test(n.title)).map(({ countries: _c, summary: _s, ...n }) => n),
  ]
    .filter((n) => !n.date || Date.parse(n.date) >= cutoff)
    .filter((n) => {
      const k = goldTitleKey(n.title);
      return goldSeen.has(n.link) || goldSeen.has(k) ? false : (goldSeen.add(n.link), goldSeen.add(k));
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, 80);

  const goldSpot = await settle('gold-spot', '金スポット価格', async () => {
    const j = JSON.parse(await get('spot', { id: 'gold-spot', url: GOLD_SPOT_URL }));
    const price = Number(j.price);
    if (!(price > 0)) throw new Error('no price');
    return { usd: price, updated: j.updatedAt ? new Date(j.updatedAt).toISOString() : now.toISOString() };
  });

  return {
    generatedAt: now.toISOString(),
    sources: [...NEWS_SOURCES, ...GOLD_NEWS_SOURCES].map((s) => ({ id: s.id, name: s.name, lang: s.lang })),
    status,
    news,
    countryCounts,
    quakes,
    disasters,
    fx,
    goldNews,
    goldSpot,
  };
}
