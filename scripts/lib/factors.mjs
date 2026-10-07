// 金相場の「要因スコア」: 金価格を動かしやすい指標それぞれに −2〜+2 の点を付け、合計で方向感を出す。
// 指標は FRED（セントルイス連銀の公開統計。登録不要の CSV）から取得する。

export const FRED_SERIES = [
  {
    id: 'DFII10',
    key: 'realYield',
    name: '米国の実質金利（10年）',
    unit: '%',
    sign: -1, // 下がると金に追い風
    weight: 2,
    why: '金は利息を生まないため、インフレ調整後の金利が下がると相対的に有利になる',
    fmt: 2,
  },
  {
    id: 'DTWEXBGS',
    key: 'dollar',
    name: 'ドルの強さ（広義ドル指数）',
    unit: '',
    sign: -1,
    weight: 1.5,
    why: '金はドル建てで取引されるため、ドル安だと割安になり買われやすい',
    fmt: 1,
  },
  {
    id: 'DGS2',
    key: 'policy',
    name: '米2年金利（利下げ観測）',
    unit: '%',
    sign: -1,
    weight: 1,
    why: '2年金利の低下は FRB の利下げ観測を映し、金の追い風になりやすい',
    fmt: 2,
  },
  {
    id: 'T10YIE',
    key: 'inflation',
    name: '期待インフレ率（10年）',
    unit: '%',
    sign: 1,
    weight: 1,
    why: 'インフレ懸念が強まると、価値の保存手段として金が買われやすい',
    fmt: 2,
  },
  {
    id: 'VIXCLS',
    key: 'fear',
    name: '恐怖指数（VIX）',
    unit: '',
    sign: 1,
    weight: 0.5,
    why: '市場の不安が高まると、安全資産として金が買われやすい',
    fmt: 1,
  },
];

const LOOKBACK = 21; // 約1ヶ月（営業日）
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** fredgraph.csv（"observation_date,ID" または "DATE,ID"、欠損は "." か空）を [[日付, 値], ...] に */
export function parseFredCsv(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [d, v] = line.split(',');
    const n = Number(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v !== '' && v !== '.' && Number.isFinite(n)) rows.push([d, n]);
  }
  return rows;
}

/**
 * 1ヶ月の変化を、過去の「1ヶ月変化」のばらつき（標準偏差）で割った値 z から点を付ける。
 * |z| < 0.5 → 0, 0.5〜1.5 → ±1, 1.5 以上 → ±2。sign で金にとっての向きに直す。
 */
export function scoreSeries(rows, sign) {
  if (rows.length < LOOKBACK * 4) return null;
  const vals = rows.map((r) => r[1]);
  const changes = [];
  for (let i = LOOKBACK; i < vals.length; i++) changes.push(vals[i] - vals[i - LOOKBACK]);
  const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
  const sd = Math.sqrt(changes.reduce((a, b) => a + (b - mean) ** 2, 0) / changes.length) || 1e-9;
  const change = changes.at(-1);
  const z = change / sd;
  const mag = Math.abs(z) < 0.5 ? 0 : Math.abs(z) < 1.5 ? 1 : 2;
  return { change, z, point: mag * Math.sign(z) * sign || 0 };
}

const sma = (vals, n) => vals.slice(-n).reduce((a, b) => a + b, 0) / n;

/** 金価格そのもののトレンド: 50日・200日移動平均との位置関係 */
export function trendFactor(goldHistory) {
  const vals = goldHistory.filter((p) => p.usd > 0).map((p) => p.usd);
  if (vals.length < 200) return null;
  const last = vals.at(-1);
  const m50 = sma(vals, 50);
  const m200 = sma(vals, 200);
  const point = (last > m50 ? 1 : -1) + (m50 > m200 ? 1 : -1);
  const desc =
    point === 2 ? '価格が50日・200日平均の上にあり上昇トレンド'
    : point === -2 ? '価格が50日・200日平均の下にあり下落トレンド'
    : last > m50 ? '短期は回復しているが長期平均は下向き'
    : '長期は上向きだが短期的に平均を割り込んでいる';
  return { point, last, m50, m200, desc };
}

const UP_WORDS = /\b(rise|rises|rising|rose|gain|gains|jump|jumps|surge|surges|soar|soars|rally|rallies|record|climb|climbs|higher|advance|advances)\b|上昇|最高値|高値更新|続伸|反発|急騰|値上がり/i;
const DOWN_WORDS = /\b(fall|falls|fell|falling|drop|drops|slip|slips|slide|slides|decline|declines|tumble|tumbles|plunge|plunges|lower|retreat|retreats|loss|losses)\b|下落|続落|反落|急落|値下がり|安値/i;

/** 金関連ニュースの見出しの論調（上昇を伝える見出しと下落を伝える見出しの数） */
export function newsTone(goldNews) {
  let up = 0;
  let down = 0;
  for (const n of goldNews) {
    const t = n.title;
    const u = UP_WORDS.test(t);
    const d = DOWN_WORDS.test(t);
    if (u && !d) up++;
    else if (d && !u) down++;
  }
  const total = up + down;
  if (total < 5) return { up, down, point: 0 };
  const ratio = (up - down) / total;
  return { up, down, point: ratio > 0.4 ? 2 : ratio > 0.15 ? 1 : ratio < -0.4 ? -2 : ratio < -0.15 ? -1 : 0 };
}

/** すべての要因をまとめ、−100〜+100 の総合スコアにする */
export function buildFactors({ fred, goldHistory, goldNews, now = new Date() }) {
  const items = [];

  for (const s of FRED_SERIES) {
    const rows = fred[s.id];
    if (!rows?.length) {
      items.push({ key: s.key, name: s.name, weight: s.weight, why: s.why, ok: false });
      continue;
    }
    const sc = scoreSeries(rows, s.sign);
    const last = rows.at(-1);
    items.push({
      key: s.key,
      name: s.name,
      weight: s.weight,
      why: s.why,
      ok: !!sc,
      point: sc?.point ?? 0,
      value: last[1],
      date: last[0],
      change: sc?.change ?? null,
      unit: s.unit,
      digits: s.fmt,
      goodWhen: s.sign > 0 ? 'up' : 'down',
      spark: rows.slice(-130).map((r) => r[1]), // 約半年
    });
  }

  const tr = trendFactor(goldHistory);
  items.push({
    key: 'trend',
    name: '金価格のトレンド',
    weight: 1.5,
    why: '相場は流れが続きやすい面がある（移動平均との位置で判定）',
    ok: !!tr,
    point: tr?.point ?? 0,
    desc: tr?.desc,
    value: tr?.last,
    m50: tr?.m50,
    m200: tr?.m200,
    spark: goldHistory.filter((p) => p.usd > 0).slice(-130).map((p) => p.usd),
  });

  const tone = newsTone(goldNews);
  items.push({
    key: 'news',
    name: '金関連ニュースの論調',
    weight: 0.5,
    why: '直近48時間の金関連見出しのうち、上昇を伝えるものと下落を伝えるものの比',
    ok: tone.up + tone.down > 0,
    point: tone.point,
    up: tone.up,
    down: tone.down,
  });

  const usable = items.filter((i) => i.ok);
  const maxScore = usable.reduce((a, i) => a + 2 * i.weight, 0);
  const raw = usable.reduce((a, i) => a + i.point * i.weight, 0);
  const total = maxScore ? Math.round((raw / maxScore) * 100) : 0;
  const verdict = total >= 30 ? 'up' : total <= -30 ? 'down' : total >= 10 ? 'lean-up' : total <= -10 ? 'lean-down' : 'neutral';

  return { generatedAt: now.toISOString(), total: clamp(total, -100, 100), verdict, usable: usable.length, items };
}
