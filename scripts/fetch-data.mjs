// 各データ源を取得して public/data/snapshot.json を書き出す。
//   node scripts/fetch-data.mjs                 … 実際のサイトから取得
//   node scripts/fetch-data.mjs --fixtures DIR  … DIR 内のサンプルファイルを使う（オフライン確認用）
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSnapshot } from './lib/snapshot.mjs';

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
  const ext = kind === 'quakes' || kind === 'fx' ? 'json' : 'xml';
  return readFileSync(join(fixtureDir, `${src.id}.${ext}`), 'utf8');
}

const snapshot = await buildSnapshot({
  get: fixtureDir ? getFixture : getRemote,
  countries,
  now: fixtureDir ? new Date(process.env.SNAPSHOT_NOW ?? '2026-10-06T12:00:00Z') : new Date(),
});
if (fixtureDir) snapshot.sample = true;

writeFileSync(outPath, JSON.stringify(snapshot));
for (const s of snapshot.status) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.name}${s.ok ? ` (${s.count ?? '-'})` : `: ${s.error}`}`);
console.log(`news=${snapshot.news.length} quakes=${snapshot.quakes.length} disasters=${snapshot.disasters.length}`);

// すべて失敗した場合はデプロイを止める（古い成功版を壊さないため）
if (snapshot.status.every((s) => !s.ok)) process.exit(1);
