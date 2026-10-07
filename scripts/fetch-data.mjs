// 各データ源を取得して public/data/snapshot.json を書き出す。
//   node scripts/fetch-data.mjs                 … 実際のサイトから取得
//   node scripts/fetch-data.mjs --fixtures DIR  … DIR 内のサンプルファイルを使う（オフライン確認用）
//
// 環境変数
//   AZURE_TRANSLATOR_KEY / AZURE_TRANSLATOR_REGION … Microsoft Translator（無料枠）で見出しを翻訳する
//   PREV_SNAPSHOT_URL    … 前回公開したスナップショット。翻訳済みの見出しを再利用して翻訳する文字数を減らす
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSnapshot } from './lib/snapshot.mjs';
import { enrichNews, prevMap } from './lib/enrich.mjs';
import { FRED_SERIES, parseFredCsv, buildFactors } from './lib/factors.mjs';
import { scoreHistory, compareFilters, toCsv, printReport } from './lib/backtest.mjs';

const args = process.argv.slice(2);
const fixtureDir = args.includes('--fixtures') ? args[args.indexOf('--fixtures') + 1] : null;
const outPath = new URL('../public/data/snapshot.json', import.meta.url);
const countries = JSON.parse(readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));

async function getRemote(_kind, src) {
  const res = await fetch(src.url, {
    headers: { 'user-agent': 'worldviewer/1.0 (+https://github.com/ozxxxra-dev/worldviewer)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function getFixture(kind, src) {
  const ext = ['quakes', 'fx', 'spot'].includes(kind) ? 'json' : 'xml';
  return readFileSync(join(fixtureDir, `${src.id}.${ext}`), 'utf8');
}

const snapshot = await buildSnapshot({
  get: fixtureDir ? getFixture : getRemote,
  countries,
  now: fixtureDir ? new Date(process.env.SNAPSHOT_NOW ?? '2026-10-06T12:00:00Z') : new Date(),
});
if (fixtureDir) snapshot.sample = true;

async function loadPrev() {
  try {
    if (fixtureDir) {
      const f = join(fixtureDir, 'prev-snapshot.json');
      return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    }
    if (!process.env.PREV_SNAPSHOT_URL) return null;
    const res = await fetch(process.env.PREV_SNAPSHOT_URL, { signal: AbortSignal.timeout(20_000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null; // 初回公開時など。全件を新規に処理する
  }
}

snapshot.enrichment = await enrichNews([...snapshot.news, ...snapshot.goldNews], {
  prev: prevMap(await loadPrev()),
  ms: !fixtureDir && process.env.AZURE_TRANSLATOR_KEY ? { key: process.env.AZURE_TRANSLATOR_KEY, region: process.env.AZURE_TRANSLATOR_REGION } : null,
});

// 金相場の要因スコア（FRED の指標 + 金価格のトレンド + ニュースの論調）
async function loadFred() {
  // 過去スコアの再計算で「その時点から3年」を使うため、5年分取得する
  const since = new Date(Date.now() - 5 * 365 * 864e5).toISOString().slice(0, 10);
  const out = {};
  await Promise.all(
    FRED_SERIES.map(async (s) => {
      try {
        const text = fixtureDir
          ? readFileSync(join(fixtureDir, `fred-${s.id}.csv`), 'utf8')
          : await getRemote('fred', { url: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.id}&cosd=${since}` });
        const rows = parseFredCsv(text);
        if (!rows.length) throw new Error('no rows');
        out[s.id] = rows;
        snapshot.status.push({ id: `fred-${s.id}`, name: `FRED ${s.name}`, ok: true, count: rows.length });
      } catch (e) {
        snapshot.status.push({ id: `fred-${s.id}`, name: `FRED ${s.name}`, ok: false, error: String(e?.message ?? e).slice(0, 200) });
      }
    }),
  );
  return out;
}
const goldHistory = JSON.parse(readFileSync(new URL('../public/data/gold-history.json', import.meta.url), 'utf8'));
const fred = await loadFred();
snapshot.factors = buildFactors({ fred, goldHistory, goldNews: snapshot.goldNews });

// 過去の各営業日のスコア（EA のバックテスト用 CSV）と、75日線フィルターとの比較
if (Object.keys(fred).length) {
  const hist = scoreHistory({ fred, goldHistory, from: '2024-10-01' });
  writeFileSync(new URL('../public/data/score-history.csv', import.meta.url), toCsv(hist));
  const report = compareFilters(hist);
  writeFileSync(new URL('../public/data/score-backtest.json', import.meta.url), JSON.stringify(report, null, 1));
  console.log(printReport(report));
}

writeFileSync(outPath, JSON.stringify(snapshot));
for (const s of snapshot.status) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.name}${s.ok ? ` (${s.count ?? '-'})` : `: ${s.error}`}`);
console.log(`news=${snapshot.news.length} quakes=${snapshot.quakes.length} disasters=${snapshot.disasters.length}`);
const f = snapshot.factors;
console.log(`factors: total=${f.total} verdict=${f.verdict} ` + f.items.map((i) => `${i.key}:${i.ok ? i.point : 'n/a'}`).join(' '));
const en = snapshot.enrichment;
console.log(`translate: ${en.translator ?? 'なし'} reused=${en.reused} translated=${en.translated} chars=${en.msChars}`);
for (const e of en.errors) console.warn(`  enrich error: ${e}`);

// すべて失敗した場合はデプロイを止める（古い成功版を壊さないため）
if (snapshot.status.every((s) => !s.ok)) process.exit(1);
