// ページ上部の帯: サイト全体をまとめた「金指数」と「警戒度」、主要な現在値
import { $, h } from './util.js';
import { spark } from './gold.js';

const VERDICT = { up: ['上昇優勢', 'up'], 'lean-up': ['やや上昇', 'up'], neutral: ['中立', ''], 'lean-down': ['やや下落', 'down'], down: ['下落優勢', 'down'] };
const CAUTION = { low: '低', mid: '中', high: '高' };
const OZ_G = 31.1034768;

const sign = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
const dir = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

function jump(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function partChip(p, fmt = sign, colored = true) {
  return h(
    'button',
    { type: 'button', class: `sum-part${p.ok ? '' : ' na'}`, title: p.desc ?? '', onclick: () => jump(p.anchor) },
    h('span', { class: 'sum-part-name' }, p.name),
    h('span', { class: `sum-part-val ${p.ok && colored ? dir(p.value) : ''}` }, p.ok ? fmt(p.value) : '—'),
  );
}

function ticker(history, snap) {
  const last = history.at(-1);
  const prev = history.at(-2);
  if (!last?.usd) return [];
  const fx = last.jpy && last.usd ? last.jpy / last.usd : null;
  // スポット価格が新しければそれを使う
  const spot = snap.goldSpot && Date.parse(snap.goldSpot.updated) > Date.parse(`${last.d}T00:00:00Z`) ? snap.goldSpot.usd : null;
  const usd = spot ?? last.usd;
  const chg = prev?.usd ? ((usd / (spot ? last.usd : prev.usd) - 1) * 100) : null;
  const items = [
    ['金', `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}/oz`, chg],
    fx && ['金（円）', `${Math.round((usd * fx) / OZ_G).toLocaleString('ja-JP')}円/g`, null],
    fx && ['ドル円', fx.toFixed(2), prev?.jpy && prev?.usd ? (fx / (prev.jpy / prev.usd) - 1) * 100 : null],
    last.xag && ['銀', `$${last.xag.toFixed(2)}`, prev?.xag ? (last.xag / prev.xag - 1) * 100 : null],
    snap.volatility?.gvz && ['GVZ', snap.volatility.gvz.value.toFixed(1), null],
  ].filter(Boolean);
  return items.map(([name, val, c]) =>
    h(
      'span',
      { class: 'tick' },
      h('span', { class: 'tick-name' }, name),
      h('b', {}, val),
      c != null && Number.isFinite(c) ? h('span', { class: `tick-chg ${dir(Math.round(c * 100))}` }, `${c >= 0 ? '▲' : '▼'}${Math.abs(c).toFixed(2)}%`) : null,
    ),
  );
}

export function renderSummary(snap, history) {
  const box = $('summary');
  const gi = snap?.goldIndex;
  if (!gi || gi.value == null) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const [label, cls] = VERDICT[gi.verdict];
  const c = gi.caution;
  const hist = gi.history.map((x) => x.value).filter((v) => v != null);
  const ne = c.nextEvent;

  box.replaceChildren(
    h(
      'div',
      { class: 'sum-main' },
      h('div', { class: 'sum-label' }, '金指数', h('small', {}, 'サイト全体の情報から算出')),
      h('div', { class: 'sum-value-row' }, h('span', { class: `sum-value ${cls}` }, sign(gi.value)), h('span', { class: `sum-verdict ${cls}` }, label), hist.length > 2 ? spark(hist, 90, 28) : null),
      h('div', { class: 'score-gauge', role: 'img', 'aria-label': `金指数 ${gi.value}（−100が下落、+100が上昇）` }, h('span', { class: 'score-mid' }), h('span', { class: 'score-marker', style: `left:${(gi.value + 100) / 2}%` })),
      h('div', { class: 'sum-parts' }, ...gi.parts.map((p) => partChip(p))),
    ),
    h(
      'div',
      { class: 'sum-caution' },
      h('div', { class: 'sum-label' }, '警戒度', h('small', {}, '急な値動きへの注意')),
      h('div', { class: 'sum-value-row' }, h('span', { class: 'sum-value' }, c.value ?? '—'), c.level ? h('span', { class: `lvl ${c.level === 'high' ? 'high' : c.level === 'low' ? 'low' : ''}` }, CAUTION[c.level]) : null),
      h('div', { class: 'meter caution-meter', role: 'img', 'aria-label': `警戒度 ${c.value}（0〜100）` }, h('span', { style: `left:${c.value ?? 0}%` })),
      h('div', { class: 'sum-parts' }, ...c.parts.map((p) => partChip(p, (v) => String(v), false))),
      ne ? h('div', { class: 'sum-next' }, '次の米重要指標: ', h('b', {}, ne.title), ne.hours <= 72 ? `（あと${ne.hours < 1 ? '1時間未満' : `${ne.hours}時間`}）` : '') : null,
    ),
    h('div', { class: 'sum-ticker' }, ...ticker(history, snap)),
    h('p', { class: 'note sum-note' }, '金指数は要因スコア・投機筋のポジション（逆張り）・地政学ニュースの多さを重み付けして −100〜+100 にまとめた目安で、価格の予測ではありません。各項目を押すと該当の欄に移動します。'),
  );
}
