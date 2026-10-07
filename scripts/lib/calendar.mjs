// 経済指標カレンダー（Forex Factory の週間カレンダー JSON。登録不要）
export const CALENDAR_URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

// よく出る指標名の日本語訳（前方一致の正規表現 → 訳）。無いものは原文のまま
const JA = [
  [/^FOMC Statement/i, 'FOMC 声明'],
  [/^Federal Funds Rate/i, '米政策金利（FOMC）'],
  [/^FOMC Press Conference/i, 'FOMC 議長会見'],
  [/^FOMC Meeting Minutes/i, 'FOMC 議事録'],
  [/^FOMC Economic Projections/i, 'FOMC 経済見通し'],
  [/^Fed Chair .* Speaks/i, 'FRB 議長発言'],
  [/^FOMC Member .* Speaks/i, 'FOMC メンバー発言'],
  [/^Non-Farm Employment Change/i, '非農業部門雇用者数'],
  [/^Unemployment Rate/i, '失業率'],
  [/^Average Hourly Earnings/i, '平均時給'],
  [/^ADP Non-Farm Employment Change/i, 'ADP 雇用統計'],
  [/^Unemployment Claims/i, '新規失業保険申請件数'],
  [/^JOLTS Job Openings/i, 'JOLTS 求人件数'],
  [/^Core CPI/i, 'コア消費者物価指数'],
  [/^CPI/i, '消費者物価指数'],
  [/^Core PPI/i, 'コア生産者物価指数'],
  [/^PPI/i, '生産者物価指数'],
  [/^Core PCE Price Index/i, 'コア PCE 物価指数'],
  [/^PCE Price Index/i, 'PCE 物価指数'],
  [/^Advance GDP|^Prelim GDP|^Final GDP|^GDP/i, 'GDP'],
  [/^Core Retail Sales/i, 'コア小売売上高'],
  [/^Retail Sales/i, '小売売上高'],
  [/^ISM Manufacturing PMI/i, 'ISM 製造業景況指数'],
  [/^ISM Services PMI/i, 'ISM 非製造業景況指数'],
  [/^Flash Manufacturing PMI/i, '製造業 PMI 速報'],
  [/^Flash Services PMI/i, 'サービス業 PMI 速報'],
  [/^Prelim UoM Consumer Sentiment|^Revised UoM Consumer Sentiment/i, 'ミシガン大学消費者信頼感'],
  [/^Prelim UoM Inflation Expectations|^Revised UoM Inflation Expectations/i, 'ミシガン大学 期待インフレ率'],
  [/^CB Consumer Confidence/i, 'コンファレンスボード消費者信頼感'],
  [/^Durable Goods Orders/i, '耐久財受注'],
  [/^Core Durable Goods Orders/i, 'コア耐久財受注'],
  [/^Building Permits/i, '住宅建築許可件数'],
  [/^Housing Starts/i, '住宅着工件数'],
  [/^Existing Home Sales/i, '中古住宅販売件数'],
  [/^New Home Sales/i, '新築住宅販売件数'],
  [/^Trade Balance/i, '貿易収支'],
  [/^Crude Oil Inventories/i, '原油在庫'],
  [/^Main Refinancing Rate/i, 'ECB 政策金利'],
  [/^ECB Press Conference/i, 'ECB 総裁会見'],
  [/^BOJ Policy Rate/i, '日銀 政策金利'],
  [/^BOJ Press Conference/i, '日銀 総裁会見'],
  [/^Official Bank Rate/i, '英中銀 政策金利'],
  [/^Bank Holiday/i, '祝日（市場休場）'],
];

export function titleJa(title) {
  for (const [re, ja] of JA) if (re.test(title)) {
    // 「m/m」「y/y」などの補足は残す
    const suffix = title.match(/\b(m\/m|y\/y|q\/q)\b/i)?.[1];
    return suffix ? `${ja}（${{ 'm/m': '前月比', 'y/y': '前年比', 'q/q': '前期比' }[suffix.toLowerCase()]}）` : ja;
  }
  return null;
}

const IMPACT = { high: 3, medium: 2, low: 1, holiday: 0 };

/** カレンダー JSON を共通形式に（重複は日時+国+指標名で除く） */
export function parseCalendar(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const e of list) {
      const t = Date.parse(e.date);
      if (!e.title || Number.isNaN(t)) continue;
      const key = `${t}|${e.country}|${e.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        time: new Date(t).toISOString(),
        country: String(e.country ?? ''),
        title: String(e.title),
        ja: titleJa(String(e.title)),
        impact: IMPACT[String(e.impact ?? '').toLowerCase()] ?? 0,
        forecast: e.forecast || null,
        previous: e.previous || null,
        actual: e.actual || null,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}
