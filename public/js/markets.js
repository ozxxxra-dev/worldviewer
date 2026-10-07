/* global d3 */
// 金相場の周辺情報: 経済指標カレンダー・値動きの荒さ（GVZ）・投機筋のポジション（CFTC）
import { $, h, cssVar } from './util.js';
import { spark } from './gold.js';

const COUNTRY = { USD: '米', EUR: '欧', JPY: '日', GBP: '英', CNY: '中', CHF: 'ス', AUD: '豪', CAD: '加', NZD: 'NZ', ALL: '全' };
const IMPACT = { 3: '高', 2: '中', 1: '低' };
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];

const PREFS_KEY = 'worldviewer.calendarPrefs';
const prefs = { usOnly: true, minImpact: 2 };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
} catch {
  /* 既定値のまま */
}
function setPref(k, v) {
  prefs[k] = v;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* noop */
  }
  renderCalendar();
}

let snap = null;

/* ---------- 経済指標カレンダー ---------- */

const jst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3); // 表示は日本時間
const dayKey = (iso) => jst(iso).toISOString().slice(0, 10);
const hm = (iso) => jst(iso).toISOString().slice(11, 16);

function until(iso) {
  const min = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (min < 60) return `あと${min}分`;
  if (min < 24 * 60) return `あと${Math.floor(min / 60)}時間${min % 60 ? `${min % 60}分` : ''}`;
  return `あと${Math.round(min / 1440)}日`;
}

function renderCalendar() {
  const box = $('calendar');
  const all = snap?.calendar ?? [];
  const chip = (label, pressed, onclick) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pressed), onclick }, label);
  $('calendar-prefs').replaceChildren(
    h(
      'div',
      { class: 'prefs' },
      h('div', { class: 'pref' }, h('span', { class: 'pref-label' }, '国'), chip('米国のみ', prefs.usOnly, () => setPref('usOnly', true)), chip('すべて', !prefs.usOnly, () => setPref('usOnly', false))),
      h('div', { class: 'pref' }, h('span', { class: 'pref-label' }, '重要度'), chip('高のみ', prefs.minImpact === 3, () => setPref('minImpact', 3)), chip('中以上', prefs.minImpact === 2, () => setPref('minImpact', 2)), chip('すべて', prefs.minImpact === 1, () => setPref('minImpact', 1))),
    ),
  );
  if (!all.length) {
    $('calendar-next').replaceChildren();
    box.replaceChildren(h('li', { class: 'empty' }, '予定を取得できませんでした'));
    return;
  }

  const now = Date.now();
  // 終わった予定は直近12時間分だけ残す
  const list = all.filter(
    (e) => (!prefs.usOnly || e.country === 'USD') && e.impact >= prefs.minImpact && Date.parse(e.time) > now - 12 * 3600e3,
  );
  const next = all.find((e) => e.country === 'USD' && e.impact === 3 && Date.parse(e.time) > now);
  $('calendar-next').replaceChildren(
    next
      ? h('div', { class: 'cal-next' }, h('span', { class: 'cal-next-label' }, '次の米重要指標'), h('b', {}, next.ja ?? next.title), ` ${Number(dayKey(next.time).slice(5, 7))}/${Number(dayKey(next.time).slice(8))} ${hm(next.time)}`, h('span', { class: 'cal-until' }, until(next.time)))
      : null,
  );

  if (!list.length) {
    box.replaceChildren(h('li', { class: 'empty' }, '条件に合う予定はありません'));
    return;
  }
  const items = [];
  let lastDay = '';
  for (const e of list) {
    const day = dayKey(e.time);
    if (day !== lastDay) {
      lastDay = day;
      const d = jst(e.time);
      items.push(h('li', { class: 'cal-day' }, `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY[d.getUTCDay()]}）`));
    }
    const past = Date.parse(e.time) <= now;
    const nums = [e.actual && `結果 ${e.actual}`, e.forecast && `予想 ${e.forecast}`, e.previous && `前回 ${e.previous}`].filter(Boolean).join('・');
    items.push(
      h(
        'li',
        { class: `cal-item${past ? ' past' : ''}${e === next ? ' next' : ''}` },
        h('span', { class: 'cal-time' }, hm(e.time)),
        h('span', { class: 'cal-country', title: e.country }, COUNTRY[e.country] ?? e.country),
        h(
          'div',
          { class: 'cal-body' },
          h('div', { class: 'cal-title', title: e.title }, e.ja ?? e.title),
          nums ? h('div', { class: 'cal-nums' }, nums) : null,
        ),
        IMPACT[e.impact] ? h('span', { class: `imp i${e.impact}`, title: '重要度' }, IMPACT[e.impact]) : h('span'),
      ),
    );
  }
  box.replaceChildren(...items);
}

/* ---------- 値動きの荒さ ---------- */

const LEVEL = { low: '落ち着いている', normal: '普通', high: '荒い' };

function meter(p) {
  return h('div', { class: 'meter', role: 'img', 'aria-label': `過去3年の中で ${p}% の位置` }, h('span', { style: `left:${p}%` }));
}

function renderVolatility() {
  const v = snap?.volatility;
  const box = $('volatility');
  if (!v?.gvz && !v?.realized) {
    box.replaceChildren(h('p', { class: 'empty' }, 'データを取得できませんでした'));
    return;
  }
  const blocks = [];
  if (v.gvz) {
    const c = v.gvz.change;
    blocks.push(
      h(
        'div',
        { class: 'vol-block' },
        h('div', { class: 'vol-head' }, h('span', {}, '金の恐怖指数（GVZ）'), h('span', { class: `lvl ${v.gvz.level}` }, LEVEL[v.gvz.level])),
        h('div', { class: 'vol-row' }, h('span', { class: 'vol-value' }, v.gvz.value.toFixed(1)), spark(v.gvz.spark)),
        h('div', { class: 'vol-sub' }, `1ヶ月で ${c >= 0 ? '▲' : '▼'}${Math.abs(c).toFixed(1)}・過去3年の中で ${v.gvz.percentile}% の位置（${v.gvz.date.replaceAll('-', '/')}）`),
        meter(v.gvz.percentile),
        h('p', { class: 'note' }, '金オプションから計算される「今後30日の予想変動率（年率%）」。高いほど市場は大きな値動きを警戒しています。'),
      ),
    );
  }
  if (v.realized) {
    blocks.push(
      h(
        'div',
        { class: 'vol-block' },
        h('div', { class: 'vol-head' }, h('span', {}, '実際の変動率（直近20営業日）'), h('span', { class: `lvl ${v.realized.level}` }, LEVEL[v.realized.level])),
        h('div', { class: 'vol-row' }, h('span', { class: 'vol-value' }, `${v.realized.value.toFixed(1)}%`), spark(v.realized.spark)),
        h('div', { class: 'vol-sub' }, `年率換算・データのある期間の中で ${v.realized.percentile}% の位置`),
        meter(v.realized.percentile),
      ),
    );
  }
  box.replaceChildren(...blocks);
}

/* ---------- 投機筋のポジション ---------- */

function cotChart(series) {
  const W = 320;
  const H = 90;
  const svg = d3.create('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'cot-chart').attr('role', 'img').attr('aria-label', '投機筋の買い越し枚数の推移（約3年）');
  const vals = series.map((s) => s[1]);
  const x = d3.scaleLinear([0, vals.length - 1], [2, W - 2]);
  const y = d3.scaleLinear([Math.min(0, d3.min(vals)), d3.max(vals)], [H - 14, 4]).nice();
  if (y.domain()[0] < 0) svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', cssVar('--line'));
  svg
    .append('path')
    .attr('d', d3.area((_v, i) => x(i), y(Math.max(0, y.domain()[0])), (v) => y(v))(vals))
    .attr('fill', cssVar('--gold'))
    .attr('fill-opacity', 0.18);
  svg.append('path').attr('d', d3.line((_v, i) => x(i), y)(vals)).attr('fill', 'none').attr('stroke', cssVar('--gold')).attr('stroke-width', 1.5);
  svg.append('circle').attr('cx', x(vals.length - 1)).attr('cy', y(vals.at(-1))).attr('r', 3).attr('fill', cssVar('--gold'));
  svg.append('text').attr('x', 2).attr('y', H - 2).attr('class', 'axis').text(series[0][0].slice(0, 7).replace('-', '/'));
  svg.append('text').attr('x', W - 2).attr('y', H - 2).attr('text-anchor', 'end').attr('class', 'axis').text(series.at(-1)[0].slice(0, 7).replace('-', '/'));
  return svg.node();
}

function renderCot() {
  const c = snap?.cot;
  const box = $('cot');
  if (!c) {
    box.replaceChildren(h('p', { class: 'empty' }, 'データを取得できませんでした'));
    return;
  }
  const p = c.percentile;
  const read =
    p >= 90 ? ['買い越しが過去3年で最大級', '買いが出尽くしに近く、反落しやすいとされる水準です。', 'high']
    : p <= 10 ? ['買い越しが過去3年で最小級', '売りが出尽くしに近く、反発しやすいとされる水準です。', 'low']
    : ['過去3年の中では平均的な水準', '極端な偏りはありません。', 'normal'];
  const fmt = (n) => Math.round(n).toLocaleString('ja-JP');
  box.replaceChildren(
    h('div', { class: 'vol-head' }, h('span', {}, 'ヘッジファンド等の買い越し枚数'), h('span', { class: `lvl ${read[2]}` }, read[0])),
    h('div', { class: 'vol-row' }, h('span', { class: 'vol-value' }, `${fmt(c.net)}枚`)),
    h(
      'div',
      { class: 'vol-sub' },
      `前週比 ${c.change >= 0 ? '▲' : '▼'}${fmt(Math.abs(c.change))}枚`,
      c.netPctOi != null ? `・建玉全体の ${c.netPctOi}%` : '',
      `・買い ${fmt(c.long)} / 売り ${fmt(c.short)}`,
    ),
    meter(p),
    h('div', { class: 'meter-ends' }, h('span', {}, '買い越しが少ない'), h('span', {}, '買い越しが多い')),
    cotChart(c.series),
    h('p', { class: 'note' }, `${read[1]}COMEX 金先物のマネージドマネーの建玉。${c.date.replaceAll('-', '/')}（火曜）時点で、米商品先物取引委員会（CFTC）が金曜に公表します。`),
  );
}

export function renderMarkets(snapshot) {
  snap = snapshot;
  renderCalendar();
  renderVolatility();
  renderCot();
}

// 「あと○時間」の表示を進める
setInterval(() => snap && renderCalendar(), 60_000);
