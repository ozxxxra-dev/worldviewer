// 投機筋のポジション: CFTC の建玉明細（Disaggregated, Futures Only）。COMEX 金（コード 088691）
// 週1回（火曜時点を金曜に公表）。登録不要の公開 API
export const COT_URL =
  "https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$where=cftc_contract_market_code='088691'" +
  '&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=160';

const num = (v) => (v == null || v === '' ? NaN : Number(v));

/**
 * マネージドマネー（ヘッジファンド等）の買い越し枚数と、過去3年の中での位置（パーセンタイル）
 */
export function parseCot(rows) {
  const weeks = rows
    .map((r) => ({
      d: String(r.report_date_as_yyyy_mm_dd ?? '').slice(0, 10),
      long: num(r.m_money_positions_long_all),
      short: num(r.m_money_positions_short_all),
      oi: num(r.open_interest_all),
    }))
    .filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.d) && Number.isFinite(w.long) && Number.isFinite(w.short))
    .sort((a, b) => a.d.localeCompare(b.d));
  if (weeks.length < 10) throw new Error(`COT のデータが不足（${weeks.length}週）`);
  const recent = weeks.slice(-156); // 約3年
  const nets = recent.map((w) => w.long - w.short);
  const last = recent.at(-1);
  const net = last.long - last.short;
  const prev = nets.at(-2);
  const percentile = Math.round((nets.filter((v) => v <= net).length / nets.length) * 100);
  return {
    date: last.d,
    long: last.long,
    short: last.short,
    net,
    change: net - prev,
    oi: Number.isFinite(last.oi) ? last.oi : null,
    netPctOi: Number.isFinite(last.oi) && last.oi ? Math.round((net / last.oi) * 1000) / 10 : null,
    percentile,
    min: Math.min(...nets),
    max: Math.max(...nets),
    series: recent.map((w) => [w.d, w.long - w.short]),
  };
}
