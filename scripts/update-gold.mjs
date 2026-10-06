// public/data/gold-history.json に未取得の日付分を追記する。
//   node scripts/update-gold.mjs            … 新しい日付を最大60日分
//   node scripts/update-gold.mjs --all      … 公開されている全期間（初回の作成用）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { updateHistory } from './lib/gold.mjs';

const path = new URL('../public/data/gold-history.json', import.meta.url);
const history = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
const all = process.argv.includes('--all');

const r = await updateHistory(history, { limit: all ? Infinity : 60 });
// 1行1日にして差分を見やすくする
writeFileSync(path, `[\n${r.history.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`);
console.log(`gold history: ${r.history.length} days (+${r.added}), latest ${r.history.at(-1)?.d}`);
for (const e of r.errors.slice(0, 10)) console.warn(`  failed ${e}`);
if (!r.history.length) process.exit(1);
