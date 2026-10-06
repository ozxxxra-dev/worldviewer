/* global d3 */
import { $, h, ago, fmtDate, cssVar } from './util.js';
import { newsItem, applyPrefs, prefControls, relLegend, queueBrowserTranslation } from './news.js';

const OZ_G = 31.1034768;

// 表示単位: 履歴の通貨キーと、1オンスあたり価格からの換算
const UNITS = {
  jpy_g: { label: '円/g', key: 'jpy', per: OZ_G, fmt: (v) => `${Math.round(v).toLocaleString('ja-JP')}円`, axis: (v) => `${Math.round(v).toLocaleString('ja-JP')}` },
  usd_oz: { label: 'ドル/oz', key: 'usd', per: 1, fmt: (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, axis: (v) => `$${Math.round(v).toLocaleString('en-US')}` },
  eur_oz: { label: 'ユーロ/oz', key: 'eur', per: 1, fmt: (v) => `€${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, axis: (v) => `€${Math.round(v).toLocaleString('en-US')}` },
};

const RANGES = [
  ['1M', '1ヶ月', { months: 1 }],
  ['3M', '3ヶ月', { months: 3 }],
  ['6M', '6ヶ月', { months: 6 }],
  ['1Y', '1年', { years: 1 }],
  ['YTD', '年初来', 'ytd'],
  ['ALL', '全期間', 'all'],
];

const CURRENCIES = [
  ['usd', '米ドル', '$'],
  ['jpy', '日本円', '¥'],
  ['eur', 'ユーロ', '€'],
  ['gbp', '英ポンド', '£'],
  ['cny', '人民元', '元'],
  ['inr', 'インドルピー', '₹'],
  ['chf', 'スイスフラン', 'CHF '],
  ['aud', '豪ドル', 'A$'],
  ['cad', 'カナダドル', 'C$'],
];

const state = { history: [], snap: null, unit: 'jpy_g', range: '1Y' };

/* ---------- 計算 ---------- */

const parseDay = (d) => new Date(`${d}T00:00:00Z`);
const dayStr = (t) => t.toISOString().slice(0, 10);

function startOf(range, lastDay) {
  const spec = RANGES.find((r) => r[0] === range)[2];
  const t = parseDay(lastDay);
  if (spec === 'all') return '0000-00-00';
  if (spec === 'ytd') return `${t.getUTCFullYear()}-01-01`;
  if (spec.months) t.setUTCMonth(t.getUTCMonth() - spec.months);
  if (spec.years) t.setUTCFullYear(t.getUTCFullYear() - spec.years);
  return dayStr(t);
}

const val = (p, unit) => {
  const u = UNITS[unit];
  return p[u.key] > 0 ? p[u.key] / u.per : null;
};
const series = (key) => state.history.filter((p) => p[key] > 0);

/** 指定日以前で最も新しい点（無ければ最初の点） */
function pointAtOrBefore(list, day) {
  let found = list[0];
  for (const p of list) {
    if (p.d > day) break;
    found = p;
  }
  return found;
}

const pct = (a, b) => (a / b - 1) * 100;

function fmtPct(v, digits = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = Math.abs(v).toFixed(digits);
  return v > 0 ? `▲ +${s}%` : v < 0 ? `▼ −${s}%` : `${s}%`;
}
const dirClass = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

/* ---------- 描画 ---------- */

function renderControls() {
  const mk = (list, cur, onPick) =>
    list.map(([id, label]) =>
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(cur === id), onclick: () => onPick(id) }, label),
    );
  $('gold-units').replaceChildren(
    ...mk(Object.entries(UNITS).map(([id, u]) => [id, u.label]), state.unit, (id) => {
      state.unit = id;
      renderGold();
    }),
  );
  $('gold-ranges').replaceChildren(
    ...mk(RANGES, state.range, (id) => {
      state.range = id;
      renderGold();
    }),
  );
}

function renderHero() {
  const u = UNITS[state.unit];
  const list = series(u.key);
  const last = list.at(-1);
  const lastV = val(last, state.unit);

  // 1時間ごとのスポット価格があれば、最新日の為替で換算して「現在値」として出す
  const spot = state.snap?.goldSpot;
  let nowV = lastV;
  let nowLabel = `${last.d.replaceAll('-', '/')} 終値ベース`;
  let prev = list.at(-2);
  if (spot && last.usd > 0 && Date.parse(spot.updated) > parseDay(last.d).getTime()) {
    nowV = (spot.usd * (last[u.key] / last.usd)) / u.per;
    nowLabel = `スポット ${fmtDate(spot.updated)} 時点（${ago(spot.updated)}）`;
    prev = last;
  }

  const ath = list.reduce((m, p) => (val(p, state.unit) > val(m, state.unit) ? p : m), list[0]);
  const athV = val(ath, state.unit);
  const fromAth = pct(nowV, athV);

  const periods = [
    ['前日比', prev],
    ['1週間', pointAtOrBefore(list, dayStr(new Date(parseDay(last.d) - 7 * 864e5)))],
    ['1ヶ月', pointAtOrBefore(list, startOf('1M', last.d))],
    ['年初来', pointAtOrBefore(list, dayStr(new Date(parseDay(startOf('YTD', last.d)) - 864e5)))],
    ['1年', pointAtOrBefore(list, startOf('1Y', last.d))],
  ];

  const yearVals = list.filter((p) => p.d >= startOf('1Y', last.d)).map((p) => val(p, state.unit));
  const yLo = Math.min(...yearVals, nowV);
  const yHi = Math.max(...yearVals, nowV);
  const pos = yHi > yLo ? ((nowV - yLo) / (yHi - yLo)) * 100 : 50;

  $('gold-hero').replaceChildren(
    h('div', { class: 'hero-label' }, `金 1${state.unit === 'jpy_g' ? 'グラム' : 'トロイオンス'}あたり（国際価格・${u.label}）`),
    h('div', { class: 'hero-value' }, u.fmt(nowV)),
    h('div', { class: 'hero-sub' }, nowLabel),
    h(
      'dl',
      { class: 'changes' },
      ...periods.flatMap(([label, p]) => {
        const c = p ? pct(nowV, val(p, state.unit)) : null;
        return [h('dt', {}, label), h('dd', { class: dirClass(c) }, fmtPct(c, label === '前日比' ? 2 : 1))];
      }),
    ),
    h(
      'div',
      { class: 'range52' },
      h('div', { class: 'range52-label' }, '過去1年のレンジ'),
      h('div', { class: 'range52-track', role: 'img', 'aria-label': `過去1年の安値から高値のうち ${Math.round(pos)}% の位置` }, h('span', { style: `left:${pos}%` })),
      h('div', { class: 'range52-ends' }, h('span', {}, `安値 ${u.fmt(yLo)}`), h('span', {}, `高値 ${u.fmt(yHi)}`)),
    ),
    h(
      'div',
      { class: 'ath' },
      fromAth >= -0.5
        ? h('span', { class: 'badge-ath' }, '最高値圏')
        : h('span', {}, `最高値 ${u.fmt(athV)}（${ath.d.replaceAll('-', '/')}）から `, h('b', { class: 'down' }, `${fromAth.toFixed(1)}%`)),
    ),
    state.unit === 'jpy_g'
      ? h('p', { class: 'note' }, '※ 国際価格をドル円で換算した税抜きの参考値。国内の店頭価格は手数料・消費税が加わり高くなります。')
      : null,
  );
}

/* --- メインチャート --- */

let CW = 760;
let CH = 300;
const M = { top: 16, right: 64, bottom: 26, left: 8 };

function renderChart() {
  const u = UNITS[state.unit];
  const all = series(u.key);
  const start = startOf(state.range, all.at(-1).d);
  const data = all.filter((p) => p.d >= start).map((p) => ({ t: parseDay(p.d), v: val(p, state.unit), d: p.d }));

  // 実際の表示幅で描く（viewBox の拡大縮小で文字が小さくならないように）
  CW = Math.max(280, $('gold-chart').parentElement.clientWidth - 16);
  CH = CW < 520 ? 230 : 300;
  const svg = d3.select('#gold-chart').attr('viewBox', `0 0 ${CW} ${CH}`).attr('width', CW).attr('height', CH);
  svg.selectAll('*').remove();
  if (data.length < 2) return;

  const x = d3.scaleUtc(d3.extent(data, (p) => p.t), [M.left, CW - M.right]);
  const [lo, hi] = d3.extent(data, (p) => p.v);
  const pad = (hi - lo) * 0.08 || hi * 0.01;
  const y = d3.scaleLinear([lo - pad, hi + pad], [CH - M.bottom, M.top]).nice(5);

  const ink = cssVar('--muted');
  const gold = cssVar('--gold');

  // グリッドと軸（控えめに）
  const yTicks = y.ticks(CH < 300 ? 4 : 5);
  svg
    .append('g')
    .selectAll('line')
    .data(yTicks)
    .join('line')
    .attr('class', 'grid')
    .attr('x1', M.left)
    .attr('x2', CW - M.right)
    .attr('y1', y)
    .attr('y2', y);
  svg
    .append('g')
    .selectAll('text')
    .data(yTicks)
    .join('text')
    .attr('class', 'axis')
    .attr('x', CW - M.right + 6)
    .attr('y', (v) => y(v) + 4)
    .text(u.axis);
  const xTicks = x.ticks(CW < 520 ? 3 : state.range === '1M' ? 4 : 6);
  const multiYear = data[0].t.getUTCFullYear() !== data.at(-1).t.getUTCFullYear();
  svg
    .append('g')
    .selectAll('text')
    .data(xTicks)
    .join('text')
    .attr('class', 'axis')
    .attr('text-anchor', 'middle')
    .attr('x', x)
    .attr('y', CH - 6)
    .text((t) => (multiYear && t.getUTCMonth() === 0 ? `${t.getUTCFullYear()}年` : `${t.getUTCMonth() + 1}/${state.range === '1M' ? t.getUTCDate() : 1}`.replace(/\/1$/, '月')));

  const area = d3.area((p) => x(p.t), y.range()[0], (p) => y(p.v));
  const line = d3.line((p) => x(p.t), (p) => y(p.v));
  const grad = svg.append('defs').append('linearGradient').attr('id', 'gold-fill').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
  grad.append('stop').attr('offset', 0).attr('stop-color', gold).attr('stop-opacity', 0.22);
  grad.append('stop').attr('offset', 1).attr('stop-color', gold).attr('stop-opacity', 0);
  svg.append('path').attr('d', area(data)).attr('fill', 'url(#gold-fill)');
  svg.append('path').attr('d', line(data)).attr('fill', 'none').attr('stroke', gold).attr('stroke-width', 2).attr('stroke-linejoin', 'round');

  // 期間の高値・安値と最新値だけ直接ラベル
  const hiP = data.reduce((m, p) => (p.v > m.v ? p : m));
  const loP = data.reduce((m, p) => (p.v < m.v ? p : m));
  const labels = [
    [hiP, `高値 ${u.fmt(hiP.v)}`, -10],
    [loP, `安値 ${u.fmt(loP.v)}`, 18],
  ];
  for (const [p, text, dy] of labels) {
    if (p === data.at(-1)) continue;
    const anchor = x(p.t) > CW * 0.75 ? 'end' : x(p.t) < CW * 0.2 ? 'start' : 'middle';
    svg.append('circle').attr('cx', x(p.t)).attr('cy', y(p.v)).attr('r', 3).attr('fill', gold).attr('class', 'ring');
    svg.append('text').attr('class', 'label').attr('text-anchor', anchor).attr('x', x(p.t)).attr('y', y(p.v) + dy).text(text);
  }
  const lastP = data.at(-1);
  svg.append('circle').attr('cx', x(lastP.t)).attr('cy', y(lastP.v)).attr('r', 4).attr('fill', gold).attr('class', 'ring');

  // ホバー: クロスヘア + ツールチップ
  const cross = svg.append('g').attr('class', 'cross').style('display', 'none');
  cross.append('line').attr('y1', M.top).attr('y2', CH - M.bottom);
  cross.append('circle').attr('r', 4.5).attr('fill', gold).attr('class', 'ring');
  const tip = $('gold-tip');
  const bisect = d3.bisector((p) => p.t).center;
  const first = data[0];

  svg
    .append('rect')
    .attr('x', M.left)
    .attr('y', 0)
    .attr('width', CW - M.left - M.right)
    .attr('height', CH)
    .attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [mx] = d3.pointer(ev);
      const p = data[bisect(data, x.invert(mx))];
      cross.style('display', null);
      cross.select('line').attr('x1', x(p.t)).attr('x2', x(p.t));
      cross.select('circle').attr('cx', x(p.t)).attr('cy', y(p.v));
      const c = pct(p.v, first.v);
      tip.replaceChildren(
        h('div', { class: 'tip-date' }, p.d.replaceAll('-', '/')),
        h('div', { class: 'tip-val' }, u.fmt(p.v)),
        h('div', { class: dirClass(c) }, `期間始めから ${fmtPct(c)}`),
      );
      tip.hidden = false;
      const px = x(p.t) + 8; // .chart-wrap の左余白
      tip.style.left = `${px > CW / 2 ? px - tip.offsetWidth - 12 : px + 12}px`;
      tip.style.top = `8px`;
    })
    .on('pointerleave', () => {
      cross.style('display', 'none');
      tip.hidden = true;
    });

  const c = pct(lastP.v, first.v);
  $('gold-chart-summary').replaceChildren(
    `${first.d.replaceAll('-', '/')} 〜 ${lastP.d.replaceAll('-', '/')}：`,
    h('b', { class: dirClass(c) }, fmtPct(c)),
    `（${u.fmt(first.v)} → ${u.fmt(lastP.v)}）`,
  );
}

/* --- 円建て価格の要因分解 --- */

function renderFactors() {
  const list = state.history.filter((p) => p.usd > 0 && p.jpy > 0);
  const last = list.at(-1);
  const first = pointAtOrBefore(list, startOf(state.range, last.d));
  // 円建て金 = ドル建て金 × ドル円。対数で分けると2つの寄与の和が全体になる
  const lnTotal = Math.log(last.jpy / first.jpy);
  const lnGold = Math.log(last.usd / first.usd);
  const lnFx = Math.log(last.jpy / last.usd / (first.jpy / first.usd));
  const total = pct(last.jpy, first.jpy);
  const share = (l) => (lnTotal === 0 ? 0 : (l / lnTotal) * total);
  const gold = share(lnGold);
  const fx = share(lnFx);
  const fx0 = first.jpy / first.usd;
  const fx1 = last.jpy / last.usd;

  const maxAbs = Math.max(Math.abs(gold), Math.abs(fx), Math.abs(total), 1);
  const bar = (label, v, cls, hint) =>
    h(
      'div',
      { class: 'fbar' },
      h('div', { class: 'fbar-label' }, label, h('small', {}, hint)),
      h(
        'div',
        { class: 'fbar-track' },
        h('div', {
          class: `fbar-fill ${cls} ${v < 0 ? 'neg' : 'pos'}`,
          style: `width:${(Math.abs(v) / maxAbs) * 50}%`,
        }),
      ),
      h('div', { class: `fbar-val ${dirClass(v)}` }, fmtPct(v)),
    );

  const rangeLabel = RANGES.find((r) => r[0] === state.range)[1];
  const fxWord = fx1 > fx0 ? '円安' : '円高';
  $('gold-factors').replaceChildren(
    bar('円建て金価格', total, 'total', ''),
    bar('ドル建て金価格の変化', gold, 'gold', `$${Math.round(first.usd).toLocaleString()} → $${Math.round(last.usd).toLocaleString()}`),
    bar(`為替（${fxWord}）の影響`, fx, 'fx', `1ドル ${fx0.toFixed(1)}円 → ${fx1.toFixed(1)}円`),
    h(
      'p',
      { class: 'note' },
      `${rangeLabel}の円建て金価格の変化 ${fmtPct(total)} のうち、金そのものの値動きが ${fmtPct(gold)}、${fxWord}による分が ${fmtPct(fx)} です。`,
    ),
  );
}

/* --- 関連指標（銀・金銀比価・ドル円） --- */

function spark(values, w = 120, hgt = 32) {
  const x = d3.scaleLinear([0, values.length - 1], [1, w - 1]);
  const y = d3.scaleLinear(d3.extent(values), [hgt - 2, 2]);
  const svg = d3.create('svg').attr('viewBox', `0 0 ${w} ${hgt}`).attr('class', 'spark').attr('aria-hidden', 'true');
  svg.append('path').attr('d', d3.line((_v, i) => x(i), y)(values)).attr('fill', 'none').attr('stroke', cssVar('--muted')).attr('stroke-width', 1.5);
  return svg.node();
}

function renderRelated() {
  const last = state.history.at(-1).d;
  const start = startOf(state.range, last);
  const rows = [
    ['銀', 'ドル/oz', (p) => p.xag, (v) => `$${v.toFixed(2)}`],
    ['金銀比価', '金1ozで買える銀のoz数', (p) => (p.xag ? p.usd / p.xag : null), (v) => v.toFixed(1)],
    ['ドル円', '円/ドル', (p) => (p.jpy && p.usd ? p.jpy / p.usd : null), (v) => v.toFixed(2)],
  ];
  $('gold-related').replaceChildren(
    ...rows.map(([name, unit, get, fmt]) => {
      const pts = state.history.filter((p) => p.d >= start && get(p) > 0);
      if (pts.length < 2) return null;
      const vs = pts.map(get);
      const c = pct(vs.at(-1), vs[0]);
      return h(
        'div',
        { class: 'rel' },
        h('div', { class: 'rel-name' }, name, h('small', {}, unit)),
        h('div', { class: 'rel-val' }, fmt(vs.at(-1))),
        h('div', { class: `rel-chg ${dirClass(c)}` }, fmtPct(c)),
        spark(vs),
      );
    }),
  );
}

/* --- 各国通貨建て --- */

function renderCurrencies() {
  const lastD = state.history.at(-1).d;
  const start = startOf(state.range, lastD);
  const ytd = dayStr(new Date(parseDay(startOf('YTD', lastD)) - 864e5));
  const rows = CURRENCIES.map(([key, name, sym]) => {
    const list = series(key);
    if (!list.length) return null;
    const last = list.at(-1);
    const max = Math.max(...list.map((p) => p[key]));
    const cRange = pct(last[key], pointAtOrBefore(list, start)[key]);
    const cYtd = pct(last[key], pointAtOrBefore(list, ytd)[key]);
    const fromAth = pct(last[key], max);
    return h(
      'tr',
      {},
      h('th', {}, key.toUpperCase(), h('small', {}, name)),
      h('td', {}, `${sym}${Math.round(last[key]).toLocaleString('ja-JP')}`),
      h('td', { class: dirClass(cRange) }, fmtPct(cRange)),
      h('td', { class: dirClass(cYtd) }, fmtPct(cYtd)),
      h('td', {}, fromAth >= -0.5 ? h('span', { class: 'badge-ath' }, '最高値圏') : `${fromAth.toFixed(1)}%`),
    );
  });
  const rangeLabel = RANGES.find((r) => r[0] === state.range)[1];
  $('gold-currencies').replaceChildren(
    h('thead', {}, h('tr', {}, h('th', {}, '通貨'), h('th', {}, '1ozあたり'), h('th', {}, rangeLabel), h('th', {}, '年初来'), h('th', {}, '最高値比'))),
    h('tbody', {}, ...rows),
  );
}

/* --- 金関連ニュース --- */

function renderGoldNews() {
  const all = state.snap?.goldNews ?? [];
  // 絞り込み・並び替え・原文表示の設定は世界情勢のニュース欄と共通
  const list = applyPrefs(all);
  $('gold-news-prefs').replaceChildren(prefControls(), relLegend(all));
  if (!list.length) {
    $('gold-news').replaceChildren(h('li', { class: 'empty' }, all.length ? '条件に合うニュースはありません' : '金関連のニュースはまだありません'));
    return;
  }
  const srcName = (id) => state.snap.sources.find((s) => s.id === id)?.name ?? id;
  queueBrowserTranslation(list.slice(0, 40));
  $('gold-news').replaceChildren(
    ...list.slice(0, 40).map((n) =>
      newsItem(n, { source: n.publisher ?? srcName(n.source) }),
    ),
  );
}

function renderGold() {
  if (!state.history.length) return;
  renderControls();
  renderHero();
  renderChart();
  renderFactors();
  renderRelated();
  renderCurrencies();
  renderGoldNews();
}

export function initGold(history, snap) {
  state.history = history;
  state.snap = snap;
  renderGold();
  let raf;
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderGold);
  addEventListener('newsprefs', renderGoldNews);
  addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(renderChart);
  });
}

export function updateGold(history, snap) {
  if (history) state.history = history;
  if (snap) state.snap = snap;
  renderGold();
}
