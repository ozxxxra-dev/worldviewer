// 値動きの荒さ: 金のボラティリティ指数（CBOE GVZ, FRED: GVZCLS）と、金価格から計算した実現ボラティリティ
export const GVZ_ID = 'GVZCLS';

const percentileOf = (vals, v) => Math.round((vals.filter((x) => x <= v).length / vals.length) * 100);

export function gvzSummary(rows) {
  if (!rows?.length) return null;
  const recent = rows.slice(-756); // 約3年（営業日）
  const vals = recent.map((r) => r[1]);
  const last = recent.at(-1);
  const monthAgo = recent.at(-22) ?? recent[0];
  return {
    value: last[1],
    date: last[0],
    change: last[1] - monthAgo[1],
    percentile: percentileOf(vals, last[1]),
    spark: recent.slice(-130).map((r) => r[1]),
  };
}

/** 直近 n 営業日の日次変化率の標準偏差 × √252（年率 %） */
export function realizedVol(goldHistory, n = 20) {
  const isWeekday = (d) => {
    const w = new Date(`${d}T00:00:00Z`).getUTCDay();
    return w !== 0 && w !== 6;
  };
  const px = goldHistory.filter((p) => p.usd > 0 && isWeekday(p.d)).map((p) => p.usd);
  const vol = (end) => {
    const r = [];
    for (let i = end - n + 1; i <= end; i++) r.push(Math.log(px[i] / px[i - 1]));
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100;
  };
  if (px.length < n + 2) return null;
  const series = [];
  for (let end = n; end < px.length; end++) series.push(vol(end));
  const value = series.at(-1);
  return { value: Math.round(value * 10) / 10, percentile: percentileOf(series, value), spark: series.slice(-130).map((v) => Math.round(v * 10) / 10) };
}

/** パーセンタイルから「落ち着いている／普通／荒い」 */
export function volLabel(p) {
  if (p == null) return null;
  return p >= 80 ? 'high' : p <= 20 ? 'low' : 'normal';
}
