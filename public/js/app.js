/* global d3, topojson */
import { $, h, ago, fmtDate, cssVar } from './util.js';
import { initGold, updateGold } from './gold.js';
import { newsItem, applyPrefs, prefControls, relLegend, initBrowserTranslate, queueBrowserTranslation } from './news.js';

const REFRESH_MS = 15 * 60 * 1000;
const NEWS_RENDER_LIMIT = 150;

const CLOCKS = [
  ['東京', 'Asia/Tokyo'],
  ['北京', 'Asia/Shanghai'],
  ['デリー', 'Asia/Kolkata'],
  ['モスクワ', 'Europe/Moscow'],
  ['ベルリン', 'Europe/Berlin'],
  ['ロンドン', 'Europe/London'],
  ['ニューヨーク', 'America/New_York'],
  ['ロサンゼルス', 'America/Los_Angeles'],
];

const DISASTER_TYPES = { TC: '熱帯低気圧', FL: '洪水', VO: '火山', DR: '干ばつ', WF: '森林火災', TS: '津波' };
const ALERT_LABEL = { red: '赤', orange: '橙', green: '緑' };
const FX_NAMES = {
  JPY: '日本円', EUR: 'ユーロ', GBP: '英ポンド', CNY: '人民元', KRW: '韓国ウォン', INR: 'インドルピー',
  RUB: 'ロシアルーブル', BRL: 'ブラジルレアル', CHF: 'スイスフラン', AUD: '豪ドル', CAD: 'カナダドル', TRY: 'トルコリラ',
};

const state = {
  snap: null,
  countries: {},
  country: null, // 選択中の国 ID
  sources: new Set(), // 空 = すべて
  q: '',
  layers: { news: true, quakes: true, disasters: true },
};

const countryName = (id) => state.countries[id]?.ja ?? id;
const sourceName = (id) => state.snap.sources.find((s) => s.id === id)?.name ?? id;

/* ---------- ヘッダー ---------- */

function renderClocks() {
  const now = new Date();
  $('clocks').replaceChildren(
    ...CLOCKS.map(([label, tz]) =>
      h('span', {}, label, h('b', {}, now.toLocaleTimeString('ja-JP', { timeZone: tz, hour: '2-digit', minute: '2-digit' }))),
    ),
  );
}

function renderMeta() {
  const { snap } = state;
  $('meta').textContent = `データ更新: ${fmtDate(snap.generatedAt)}（${ago(snap.generatedAt)}）・ニュース ${snap.news.length} 件`;
  $('sample-banner').hidden = !snap.sample;
}

/* ---------- 地図 ---------- */

const map = { svg: null, g: null, zoom: null, path: null, projection: null, k: 1, color: null };
const W = 960;
const H = 500;

function initMap(world) {
  map.projection = d3.geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'Sphere' });
  map.path = d3.geoPath(map.projection);
  map.svg = d3.select('#map').attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
  map.g = map.svg.append('g');

  map.g.append('path').attr('class', 'graticule').attr('d', map.path(d3.geoGraticule10()));

  const features = topojson.feature(world, world.objects.countries).features;
  map.g
    .append('g')
    .attr('class', 'countries')
    .selectAll('path')
    .data(features)
    .join('path')
    .attr('class', 'country')
    .attr('d', map.path)
    .on('mousemove', (ev, f) => {
      const id = f.id ?? f.properties.name;
      const n = state.snap.countryCounts[id] ?? 0;
      showTip(ev, [h('b', {}, countryName(id)), ` ${state.countries[id]?.en ?? ''}`, h('br'), `ニュース ${n} 件`]);
    })
    .on('mouseleave', hideTip)
    .on('click', (_ev, f) => selectCountry(f.id ?? f.properties.name));

  map.g.append('g').attr('class', 'quakes-layer');
  map.g.append('g').attr('class', 'disasters-layer');

  map.zoom = d3
    .zoom()
    .scaleExtent([1, 12])
    .translateExtent([[0, 0], [W, H]])
    .on('zoom', (ev) => {
      map.k = ev.transform.k;
      map.g.attr('transform', ev.transform);
      map.g.selectAll('.quake').attr('r', (d) => quakeR(d) / map.k);
      map.g.selectAll('.disaster').attr('r', 6 / map.k);
    });
  map.svg.call(map.zoom);
  $('zoom-in').onclick = () => map.svg.transition().call(map.zoom.scaleBy, 1.6);
  $('zoom-out').onclick = () => map.svg.transition().call(map.zoom.scaleBy, 1 / 1.6);
  $('zoom-reset').onclick = () => map.svg.transition().call(map.zoom.transform, d3.zoomIdentity);

  for (const cb of document.querySelectorAll('[data-layer]')) {
    cb.addEventListener('change', () => {
      state.layers[cb.dataset.layer] = cb.checked;
      renderMap();
    });
  }
  // OS のダークモード切替に追従して塗り色を更新
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderMap);
}

const quakeR = (d) => Math.max(2, (d.mag - 4) * 3.2);

function renderMap() {
  const { snap } = state;
  const max = d3.max(Object.values(snap.countryCounts)) ?? 1;
  map.color = d3
    .scaleSqrt()
    .domain([1, Math.max(2, max)])
    .range([cssVar('--heat-0'), cssVar('--heat-1')])
    .interpolate(d3.interpolateLab)
    .clamp(true);

  map.g
    .selectAll('.country')
    .style('fill', (f) => {
      const n = snap.countryCounts[f.id ?? f.properties.name];
      return state.layers.news && n ? map.color(n) : null;
    })
    .classed('selected', (f) => (f.id ?? f.properties.name) === state.country);

  const proj = (d) => map.projection([d.lon, d.lat]);

  map.g
    .select('.quakes-layer')
    .classed('hidden', !state.layers.quakes)
    .selectAll('circle')
    .data(
      [...snap.quakes].sort((a, b) => b.mag - a.mag),
      (d) => d.url,
    )
    .join('circle')
    .attr('class', 'quake')
    .attr('cx', (d) => proj(d)[0])
    .attr('cy', (d) => proj(d)[1])
    .attr('r', (d) => quakeR(d) / map.k)
    .on('mousemove', (ev, d) =>
      showTip(ev, [h('b', {}, `M${d.mag.toFixed(1)}`), ` ${d.place}`, h('br'), `${fmtDate(d.time)}・深さ ${Math.round(d.depth)}km`]),
    )
    .on('mouseleave', hideTip)
    .on('click', (_ev, d) => window.open(d.url, '_blank', 'noopener'));

  map.g
    .select('.disasters-layer')
    .classed('hidden', !state.layers.disasters)
    .selectAll('circle')
    .data(
      snap.disasters.filter((d) => d.lat != null),
      (d) => d.link,
    )
    .join('circle')
    .attr('class', 'disaster')
    .attr('cx', (d) => proj(d)[0])
    .attr('cy', (d) => proj(d)[1])
    .attr('r', 6 / map.k)
    .style('fill', (d) => alertColor(d.alert))
    .on('mousemove', (ev, d) => showTip(ev, [h('b', {}, DISASTER_TYPES[d.type] ?? d.type), ` ${d.title}`]))
    .on('mouseleave', hideTip)
    .on('click', (_ev, d) => window.open(d.link, '_blank', 'noopener'));

  $('legend').replaceChildren(
    h('span', {}, 'ニュース件数', h('span', { class: 'ramp' }), `最大 ${max}`),
    h('span', {}, h('span', { class: 'dot', style: `background:${cssVar('--quake')}` }), '地震（円の大きさ=規模）'),
    h('span', {}, h('span', { class: 'dot', style: `background:${cssVar('--red')}` }), '災害警報'),
  );
}

const alertColor = (a) => cssVar(a === 'red' ? '--red' : a === 'orange' ? '--orange' : '--green');

function showTip(ev, content) {
  const tip = $('tooltip');
  const box = $('map-wrap').getBoundingClientRect();
  tip.replaceChildren(...content);
  tip.hidden = false;
  const x = ev.clientX - box.left + 12;
  const y = ev.clientY - box.top + 12;
  tip.style.left = `${Math.min(x, box.width - tip.offsetWidth - 4)}px`;
  tip.style.top = `${Math.min(y, box.height - tip.offsetHeight - 4)}px`;
}
const hideTip = () => ($('tooltip').hidden = true);

function renderHot() {
  const top = Object.entries(state.snap.countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);
  $('hot').replaceChildren(
    h('small', { style: 'align-self:center;margin-right:4px' }, '話題の国'),
    ...top.map(([id, n]) =>
      h(
        'button',
        { type: 'button', class: 'chip', 'aria-pressed': String(state.country === id), onclick: () => selectCountry(id) },
        countryName(id),
        h('span', { class: 'n' }, n),
      ),
    ),
  );
}

function selectCountry(id) {
  state.country = state.country === id ? null : id;
  renderMap();
  renderHot();
  renderNews();
}

/* ---------- ニュース ---------- */

function renderSourceChips() {
  const counts = d3.rollup(state.snap.news, (v) => v.length, (n) => n.source);
  $('source-chips').replaceChildren(
    ...state.snap.sources
      .filter((s) => counts.get(s.id))
      .map((s) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip',
            'aria-pressed': String(state.sources.has(s.id)),
            onclick: () => {
              state.sources.has(s.id) ? state.sources.delete(s.id) : state.sources.add(s.id);
              renderSourceChips();
              renderNews();
            },
          },
          s.name,
          h('span', { class: 'n' }, counts.get(s.id)),
        ),
      ),
  );
}

function renderNews() {
  const q = state.q.toLowerCase();
  const items = applyPrefs(
    state.snap.news.filter(
      (n) =>
        (!state.country || n.countries.includes(state.country)) &&
        (state.sources.size === 0 || state.sources.has(n.source)) &&
        (!q || `${n.title} ${n.summary} ${n.ai?.ja ?? ''}`.toLowerCase().includes(q)),
    ),
  );

  $('news-title').textContent = state.country ? `${countryName(state.country)} のニュース（${items.length}件）` : `最新ニュース（${items.length}件）`;
  $('clear-country').hidden = !state.country;
  $('news-prefs').replaceChildren(prefControls(), relLegend(state.snap.news));

  if (!items.length) {
    $('news').replaceChildren(h('li', { class: 'empty' }, '該当するニュースはありません'));
    return;
  }
  const shown = items.slice(0, NEWS_RENDER_LIMIT);
  queueBrowserTranslation(shown);
  $('news').replaceChildren(
    ...shown.map((n) =>
      newsItem(n, {
        source: sourceName(n.source),
        meta: n.countries.map((id) =>
          h('button', { type: 'button', class: 'tag', lang: 'ja', onclick: () => selectCountry(id) }, countryName(id)),
        ),
      }),
    ),
  );
}

/* ---------- 地震・災害・為替 ---------- */

function renderQuakes() {
  const list = state.snap.quakes;
  if (!list.length) return $('quakes').replaceChildren(h('li', { class: 'empty' }, 'データがありません'));
  $('quakes').replaceChildren(
    ...list.slice(0, 60).map((q) =>
      h(
        'li',
        {},
        h(
          'span',
          { class: 'badge', style: `background:${cssVar(q.mag >= 7 ? '--red' : q.mag >= 6 ? '--orange' : '--quake')}` },
          q.mag.toFixed(1),
        ),
        h(
          'div',
          { class: 'body' },
          h('a', { href: q.url, target: '_blank', rel: 'noopener', lang: 'en' }, q.place),
          h('div', { class: 'sub' }, `${fmtDate(q.time)}・深さ ${Math.round(q.depth)}km${q.tsunami ? '・津波情報あり' : ''}`),
        ),
      ),
    ),
  );
}

function renderDisasters() {
  const list = state.snap.disasters;
  if (!list.length) return $('disasters').replaceChildren(h('li', { class: 'empty' }, '現在の警報はありません'));
  const rank = { red: 0, orange: 1, green: 2 };
  $('disasters').replaceChildren(
    ...[...list]
      .sort((a, b) => (rank[a.alert] ?? 3) - (rank[b.alert] ?? 3) || (b.date ?? '').localeCompare(a.date ?? ''))
      .map((d) =>
        h(
          'li',
          {},
          h('span', { class: 'badge', style: `background:${alertColor(d.alert)}` }, ALERT_LABEL[d.alert] ?? '—'),
          h(
            'div',
            { class: 'body' },
            h('a', { href: d.link, target: '_blank', rel: 'noopener', lang: 'en' }, d.title),
            h('div', { class: 'sub' }, [DISASTER_TYPES[d.type] ?? d.type, d.country, d.date && fmtDate(d.date)].filter(Boolean).join('・')),
          ),
        ),
      ),
  );
}

function renderFx() {
  const fx = state.snap.fx;
  if (!fx) {
    $('fx').replaceChildren(h('tbody', {}, h('tr', {}, h('td', { class: 'empty' }, 'データがありません'))));
    return;
  }
  $('fx-updated').textContent = `${fmtDate(fx.updated)} 時点`;
  const jpy = fx.rates.JPY;
  const fmt = (v) => v.toLocaleString('ja-JP', { maximumSignificantDigits: 5 });
  $('fx').replaceChildren(
    h('thead', {}, h('tr', {}, h('th', {}, '通貨'), h('td', { class: 'name' }), h('th', { style: 'text-align:right' }, '1米ドル ='), h('th', { style: 'text-align:right' }, '円換算'))),
    h(
      'tbody',
      {},
      ...Object.entries(fx.rates).map(([code, rate]) =>
        h(
          'tr',
          {},
          h('th', {}, code),
          h('td', { class: 'name' }, FX_NAMES[code] ?? ''),
          h('td', {}, fmt(rate)),
          h('td', {}, code === 'JPY' ? `1ドル ${fmt(jpy)}円` : jpy ? `${fmt(jpy / rate)}円` : '—'),
        ),
      ),
    ),
  );
}

function renderStatus() {
  $('status').replaceChildren(
    ...state.snap.status.map((s) =>
      h('li', { class: s.ok ? '' : 'ng' }, `${s.name}: `, s.ok ? `取得成功${s.count != null ? `（${s.count}件）` : ''}` : `取得失敗（${s.error}）`),
    ),
  );
}

function renderAll() {
  renderMeta();
  renderMap();
  renderHot();
  renderSourceChips();
  renderNews();
  renderQuakes();
  renderDisasters();
  renderFx();
  renderStatus();
}

/* ---------- 起動 ---------- */

async function loadSnapshot() {
  const res = await fetch(`data/snapshot.json?t=${Date.now()}`);
  if (!res.ok) throw new Error(`snapshot.json: HTTP ${res.status}`);
  return res.json();
}

async function loadGoldHistory() {
  const res = await fetch(`data/gold-history.json?t=${Date.now()}`);
  if (!res.ok) throw new Error(`gold-history.json: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  renderClocks();
  setInterval(renderClocks, 30_000);

  const [snap, countries, world, gold] = await Promise.all([
    loadSnapshot(),
    fetch('data/countries.json').then((r) => r.json()),
    fetch('vendor/countries-110m.json').then((r) => r.json()),
    loadGoldHistory(),
  ]);
  state.snap = snap;
  state.countries = countries;
  initGold(gold, snap);

  initMap(world);
  $('q').addEventListener('input', (e) => {
    state.q = e.target.value.trim();
    renderNews();
  });
  $('clear-country').onclick = () => selectCountry(state.country);
  addEventListener('newsprefs', renderNews);
  initBrowserTranslate();
  renderAll();

  // 開きっぱなしでも新しいスナップショットに追従する
  setInterval(async () => {
    try {
      const next = await loadSnapshot();
      if (next.generatedAt !== state.snap.generatedAt) {
        state.snap = next;
        renderAll();
        updateGold(await loadGoldHistory(), next);
      } else {
        renderMeta();
      }
    } catch {
      /* 一時的な失敗は次回に再試行 */
    }
  }, REFRESH_MS);
}

main().catch((e) => {
  console.error(e);
  $('meta').textContent = `データを読み込めませんでした: ${e.message}`;
});
