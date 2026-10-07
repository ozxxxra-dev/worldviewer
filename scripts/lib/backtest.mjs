// 要因スコアを過去の各営業日について再計算し、75日移動平均フィルターと比べる。
// 各日のスコアはその日より前に公表されたデータだけで計算する（先読みしない）。
// ニュースの論調は過去分が無いので除く。
import { buildFactors, FRED_SERIES } from './factors.mjs';

export const MA_PERIOD = 75;
export const THRESHOLD = 30;
const HORIZONS = [5, 20];

const isWeekday = (d) => {
  const w = new Date(`${d}T00:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6;
};

/** 日々の [日付, 終値, 総合スコア, マクロのみのスコア, 75日線] を作る */
export function scoreHistory({ fred, goldHistory, from }) {
  const gold = goldHistory.filter((p) => p.usd > 0);
  const daily = gold.filter((p) => isWeekday(p.d)); // MT4 の日足に合わせて平日だけ
  const fredKeys = new Set(FRED_SERIES.map((s) => s.key));
  const rows = [];
  for (let i = MA_PERIOD - 1; i < daily.length; i++) {
    const day = daily[i];
    if (from && day.d < from) continue;
    const ma = daily.slice(i - MA_PERIOD + 1, i + 1).reduce((a, p) => a + p.usd, 0) / MA_PERIOD;
    const f = buildFactors({
      fred,
      goldHistory: gold.filter((p) => p.d <= day.d),
      goldNews: [],
      now: new Date(`${day.d}T00:00:00Z`),
    });
    const macro = f.items.filter((it) => fredKeys.has(it.key) && it.ok);
    const macroMax = macro.reduce((a, it) => a + 2 * it.weight, 0);
    const macroScore = macroMax ? Math.round((macro.reduce((a, it) => a + it.point * it.weight, 0) / macroMax) * 100) : null;
    rows.push({ d: day.d, close: day.usd, score: f.usable ? f.total : null, macro: macroScore, ma75: ma });
  }
  return rows;
}

const state = (v) => (v == null ? 0 : v >= THRESHOLD ? 1 : v <= -THRESHOLD ? -1 : 0);

function corr(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let c = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    c += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  return vx && vy ? c / Math.sqrt(vx * vy) : null;
}

const pct = (v) => (v == null ? null : Math.round(v * 1000) / 10);

/**
 * フィルターごとに「買い許可／売り許可の日の、その後N営業日の金の騰落」を集計する。
 * follow = 許可された向きに N 日持った場合の平均損益（%）、hit = 向きが当たった割合。
 */
export function compareFilters(rows) {
  const filters = {
    score: (r) => state(r.score),
    macro: (r) => state(r.macro),
    ma75: (r) => (r.close > r.ma75 ? 1 : -1),
  };
  const out = { days: rows.length, from: rows[0]?.d, to: rows.at(-1)?.d, filters: {}, agreement: {}, correlation: {} };

  for (const [name, fn] of Object.entries(filters)) {
    const res = { longDays: 0, shortDays: 0, flatDays: 0, horizons: {} };
    for (const r of rows) {
      const s = fn(r);
      if (s > 0) res.longDays++;
      else if (s < 0) res.shortDays++;
      else res.flatDays++;
    }
    for (const hz of HORIZONS) {
      const longs = [];
      const shorts = [];
      for (let i = 0; i + hz < rows.length; i++) {
        const s = fn(rows[i]);
        const fwd = rows[i + hz].close / rows[i].close - 1;
        if (s > 0) longs.push(fwd);
        else if (s < 0) shorts.push(fwd);
      }
      const all = [...longs, ...shorts.map((v) => -v)];
      const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
      res.horizons[hz] = {
        afterLong: pct(mean(longs)), // 買い許可の日の後の平均騰落
        afterShort: pct(mean(shorts)), // 売り許可の日の後の平均騰落
        follow: pct(mean(all)),
        hit: all.length ? Math.round((all.filter((v) => v > 0).length / all.length) * 100) : null,
        n: all.length,
      };
    }
    out.filters[name] = res;
  }

  // スコアが方向を出した日に、75日線と同じ向きだった割合
  for (const name of ['score', 'macro']) {
    const active = rows.filter((r) => filters[name](r) !== 0);
    const same = active.filter((r) => filters[name](r) === filters.ma75(r)).length;
    out.agreement[name] = { activeDays: active.length, sameAsMa75: active.length ? Math.round((same / active.length) * 100) : null };
    const valid = rows.filter((r) => r[name] != null);
    out.correlation[name] = Math.round((corr(valid.map((r) => r[name]), valid.map((r) => r.close / r.ma75 - 1)) ?? NaN) * 100) / 100;
  }
  // 比較の基準: 期間中ずっと買っていた場合
  out.buyAndHold = Object.fromEntries(
    HORIZONS.map((hz) => {
      const xs = [];
      for (let i = 0; i + hz < rows.length; i++) xs.push(rows[i + hz].close / rows[i].close - 1);
      return [hz, pct(xs.reduce((a, b) => a + b, 0) / xs.length)];
    }),
  );
  return out;
}

/** EA のバックテスト用 CSV（MT4 の FileOpen で読みやすいよう日付は YYYY.MM.DD） */
export function toCsv(rows) {
  const lines = ['date,score,macro,close,ma75'];
  for (const r of rows) lines.push([r.d.replaceAll('-', '.'), r.score ?? '', r.macro ?? '', r.close.toFixed(2), r.ma75.toFixed(2)].join(','));
  return `${lines.join('\n')}\n`;
}

export function printReport(rep) {
  const L = [];
  L.push(`期間 ${rep.from}〜${rep.to}（${rep.days}営業日）`);
  L.push(`75日線との相関: 総合 ${rep.correlation.score} / マクロのみ ${rep.correlation.macro}`);
  L.push(`方向が出た日に75日線と同じ向きだった割合: 総合 ${rep.agreement.score.sameAsMa75}%（${rep.agreement.score.activeDays}日） / マクロのみ ${rep.agreement.macro.sameAsMa75}%（${rep.agreement.macro.activeDays}日）`);
  for (const [name, f] of Object.entries(rep.filters)) {
    const h = Object.entries(f.horizons).map(([hz, v]) => `${hz}日後: 買い許可後 ${v.afterLong}% / 売り許可後 ${v.afterShort}% / 従った場合 ${v.follow}%・的中 ${v.hit}%（${v.n}）`).join(' | ');
    L.push(`[${name}] 買い${f.longDays}日 売り${f.shortDays}日 見送り${f.flatDays}日 | ${h}`);
  }
  L.push(`参考: ずっと買い 5日後 ${rep.buyAndHold[5]}% / 20日後 ${rep.buyAndHold[20]}%`);
  return L.join('\n');
}
