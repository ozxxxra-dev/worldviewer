// サイト全体の情報を1つにまとめた「金指数」（方向: −100〜+100）と「警戒度」（0〜100）。
// 方向は要因スコア・投機筋のポジション・地政学ニュースから、警戒度は値動きの荒さ・指標発表・地政学ニュースから作る。
// 地政学ニュースの多さは過去との比較が要るので、毎回の件数を履歴として次回に引き継ぐ（history）。

const GEO_WORDS = /\b(war|wars|attack|attacks|attacked|missile|missiles|airstrike|airstrikes|strike on|invasion|invade|troops|military|conflict|shelling|drone strike|nuclear|sanction|sanctions|hostage|coup)\b|戦争|攻撃|ミサイル|空爆|侵攻|軍事|紛争|砲撃|核|制裁|クーデター|人質/i;
const HISTORY_MAX = 2000; // 毎時更新でも約3ヶ月分
const MIN_HISTORY = 24; // これ未満の履歴しかないうちは地政学の項目を使わない

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const percentile = (vals, v) => Math.round((vals.filter((x) => x <= v).length / vals.length) * 100);

/** 直近48時間のニュースのうち、紛争・軍事・制裁などを扱う見出しの数 */
export function geoCount(news) {
  return news.filter((n) => GEO_WORDS.test(n.title)).length;
}

/** 投機筋の偏りを逆張りで点数化（買い越しが極端なら反落しやすい → マイナス） */
function cotPoint(p) {
  return p >= 90 ? -100 : p >= 75 ? -50 : p <= 10 ? 100 : p <= 25 ? 50 : 0;
}

/** 次の米重要指標までの時間から警戒度（24時間以内 100、3日以内 50） */
function eventCaution(calendar, now) {
  const next = calendar.find((e) => e.country === 'USD' && e.impact === 3 && Date.parse(e.time) > now.getTime());
  if (!next) return { value: 0, next: null };
  const hours = (Date.parse(next.time) - now.getTime()) / 3600e3;
  return { value: hours <= 24 ? 100 : hours <= 72 ? 50 : 0, next, hours };
}

export function buildGoldIndex({ factors, cot, volatility, calendar = [], news = [], prevHistory = [], now = new Date() }) {
  const geo = geoCount(news);
  const history = [...prevHistory, { t: now.toISOString(), geo }].slice(-HISTORY_MAX);
  const geoVals = history.map((h) => h.geo);
  const geoPct = history.length >= MIN_HISTORY ? percentile(geoVals, geo) : null;

  // --- 方向（−100〜+100） ---
  const parts = [
    {
      key: 'factors',
      name: '要因スコア',
      weight: 0.6,
      ok: factors?.usable > 0,
      value: factors?.total ?? 0,
      desc: '金利・ドル・期待インフレ・VIX・トレンド・ニュースの論調',
      anchor: 'gold-score-card',
    },
    {
      key: 'cot',
      name: '投機筋（逆張り）',
      weight: 0.2,
      ok: !!cot,
      value: cot ? cotPoint(cot.percentile) : 0,
      desc: cot ? `買い越しは過去3年の ${cot.percentile}% の位置` : 'データなし',
      anchor: 'cot-card',
    },
    {
      key: 'geo',
      name: '地政学リスク',
      weight: 0.2,
      ok: geoPct != null,
      // 紛争ニュースが普段より多いと安全資産として金が買われやすい
      value: geoPct == null ? 0 : Math.round(((geoPct - 50) / 50) * 100),
      desc: geoPct == null ? `紛争関連ニュース ${geo}件（比較用の履歴を蓄積中）` : `紛争関連ニュース ${geo}件・普段と比べて ${geoPct}% の位置`,
      anchor: 'world-head',
    },
  ];
  const usable = parts.filter((p) => p.ok);
  const wsum = usable.reduce((a, p) => a + p.weight, 0);
  const value = wsum ? Math.round(clamp(usable.reduce((a, p) => a + p.value * p.weight, 0) / wsum, -100, 100)) : null;
  const verdict = value == null ? null : value >= 30 ? 'up' : value <= -30 ? 'down' : value >= 10 ? 'lean-up' : value <= -10 ? 'lean-down' : 'neutral';

  // --- 警戒度（0〜100） ---
  const ev = eventCaution(calendar, now);
  const volPct = volatility?.gvz?.percentile ?? volatility?.realized?.percentile ?? null;
  const cparts = [
    { key: 'vol', name: '値動きの荒さ', weight: 0.4, ok: volPct != null, value: volPct ?? 0, anchor: 'vol-card' },
    { key: 'event', name: '重要指標の発表', weight: 0.35, ok: true, value: ev.value, anchor: 'cal-card' },
    { key: 'geo', name: '地政学ニュース', weight: 0.25, ok: geoPct != null, value: geoPct ?? 0, anchor: 'world-head' },
  ];
  const cu = cparts.filter((p) => p.ok);
  const cw = cu.reduce((a, p) => a + p.weight, 0);
  const caution = cw ? Math.round(cu.reduce((a, p) => a + p.value * p.weight, 0) / cw) : null;

  return {
    value,
    verdict,
    parts,
    caution: {
      value: caution,
      level: caution == null ? null : caution >= 60 ? 'high' : caution >= 35 ? 'mid' : 'low',
      parts: cparts,
      nextEvent: ev.next ? { time: ev.next.time, title: ev.next.ja ?? ev.next.title, hours: Math.round(ev.hours) } : null,
    },
    geo: { count: geo, percentile: geoPct, samples: history.length },
    history: history.map((h, i) => (i === history.length - 1 ? { ...h, value, caution } : h)),
  };
}
