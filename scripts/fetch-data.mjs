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

writeFileSync(outPath, JSON.stringify(snapshot));
for (const s of snapshot.status) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.name}${s.ok ? ` (${s.count ?? '-'})` : `: ${s.error}`}`);
console.log(`news=${snapshot.news.length} quakes=${snapshot.quakes.length} disasters=${snapshot.disasters.length}`);
const en = snapshot.enrichment;
console.log(`translate: ${en.translator ?? 'なし'} reused=${en.reused} translated=${en.translated} chars=${en.msChars}`);
for (const e of en.errors) console.warn(`  enrich error: ${e}`);

// すべて失敗した場合はデプロイを止める（古い成功版を壊さないため）
if (snapshot.status.every((s) => !s.ok)) process.exit(1);
