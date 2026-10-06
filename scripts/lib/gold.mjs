import { gunzipSync } from 'node:zlib';

// 金・貴金属の日次データ。取得元は fawazahmed0/currency-api（毎日 npm に日付版が公開される）
export const PKG = '@fawazahmed0/currency-api';
export const REGISTRY = `https://registry.npmjs.org/${PKG}`;
const FILE = 'v1/currencies/xau.min.json';
export const CURRENCIES = ['usd', 'jpy', 'eur', 'gbp', 'cny', 'inr', 'chf', 'aud', 'cad'];
export const OZ_G = 31.1034768; // 1トロイオンス = 31.1034768 g

/** 日付 → npm のバージョン文字列（2026-10-06 → 2026.10.6） */
export const versionOf = (d) => d.split('-').map(Number).join('.');

/** xau.json（1オンスの金が各通貨でいくらか）から1日分の点を作る */
export function extractPoint(j) {
  const x = j.xau;
  const p = { d: j.date };
  for (const c of CURRENCIES) if (x[c] > 0) p[c] = round(x[c]);
  if (!(p.usd > 0)) throw new Error(`no usd price for ${j.date}`);
  // 銀のドル建て価格（xau.xag = 金1オンスで買える銀のオンス数 = 金銀比価）
  for (const m of ['xag']) if (x[m] > 0) p[m] = round(x.usd / x[m]);
  return p;
}

const round = (v) => Math.round(v * 1e4) / 1e4;

/** 日付で重複を除いてマージし、データ源の不具合による一時的な跳ね（スパイク）を除く */
export function mergeHistory(history, points) {
  const byDate = new Map(history.map((p) => [p.d, { ...p }]));
  for (const p of points) byDate.set(p.d, { ...p });
  const out = [...byDate.values()].sort((a, b) => a.d.localeCompare(b.d));
  for (const key of [...CURRENCIES, 'xag']) removeSpikes(out, key);
  return out.filter((p) => p.usd > 0);
}

/** 前後の値から15%以上外れて翌日に戻る1日だけの値を欠損扱いにする（本当の急変は翌日も続くので残る） */
function removeSpikes(points, key, threshold = 0.15) {
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1][key], points[i][key], points[i + 1][key]];
    if (!(a > 0 && b > 0 && c > 0)) continue;
    if (Math.abs(b / a - 1) > threshold && Math.abs(c / a - 1) < threshold / 2) delete points[i][key];
  }
}

/** 最小限の tar 読み出し: 指定パスのファイル内容を返す */
export function readFromTgz(buf, path) {
  const tar = gunzipSync(buf);
  for (let off = 0; off + 512 <= tar.length; ) {
    const name = tar.toString('utf8', off, off + 100).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.toString('utf8', off + 124, off + 136).replace(/\0.*$/s, '').trim() || '0', 8);
    const prefix = tar.toString('utf8', off + 345, off + 500).replace(/\0.*$/s, '');
    const full = prefix ? `${prefix}/${name}` : name;
    if (full === path) return tar.toString('utf8', off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${path} not found in tarball`);
}

/**
 * 指定バージョンの xau.json を取得する。jsDelivr（小さい単体ファイル）→ npm レジストリ（tarball）の順に試す。
 * fetchImpl は差し替え可能（テスト用）。
 */
export async function fetchXau(version, fetchImpl = fetch) {
  const errors = [];
  try {
    const r = await fetchImpl(`https://cdn.jsdelivr.net/npm/${PKG}@${version}/${FILE}`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    errors.push(`jsdelivr: ${e.message}`);
  }
  try {
    const name = PKG.split('/')[1];
    const r = await fetchImpl(`${REGISTRY}/-/${name}-${version}.tgz`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return JSON.parse(readFromTgz(Buffer.from(await r.arrayBuffer()), `package/${FILE}`));
  } catch (e) {
    errors.push(`npm: ${e.message}`);
  }
  throw new Error(errors.join(' / '));
}

/** npm に公開済みの日付版バージョン一覧（古い順） */
export async function listVersions(fetchImpl = fetch) {
  const r = await fetchImpl(REGISTRY, { headers: { accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`registry HTTP ${r.status}`);
  const j = await r.json();
  return Object.keys(j.versions)
    .filter((v) => /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(v))
    .sort((a, b) => toDate(a).localeCompare(toDate(b)));
}
export const toDate = (v) => v.split('.').map((n, i) => (i ? n.padStart(2, '0') : n)).join('-');

/** 履歴の最新日より後のデータを取得してマージする */
export async function updateHistory(history, { fetchImpl = fetch, limit = 60, concurrency = 6 } = {}) {
  const last = history.at(-1)?.d ?? '';
  // 最新日より後の日付だけを、新しい方から最大 limit 件
  const todo = (await listVersions(fetchImpl)).filter((v) => toDate(v) > last).slice(-limit);
  const points = [];
  const errors = [];
  for (let i = 0; i < todo.length; i += concurrency) {
    const batch = await Promise.allSettled(todo.slice(i, i + concurrency).map((v) => fetchXau(v, fetchImpl)));
    batch.forEach((r, k) => (r.status === 'fulfilled' ? points.push(extractPoint(r.value)) : errors.push(`${todo[i + k]}: ${r.reason.message}`)));
  }
  return { history: mergeHistory(history, points), added: points.length, errors };
}
