// ニュース項目の共通表示: 日本語訳・金相場との関連度・表示設定
import { h, ago, fmtDate } from './util.js';

const REL_LABEL = { 3: '高', 2: '中', 1: '低' };
const DIR_LABEL = { up: '↑ 上昇要因', down: '↓ 下落要因', mixed: '↕ 両面' };

/* ---------- 表示設定（両方のニュース欄で共有し、ブラウザに記憶） ---------- */

const PREFS_KEY = 'worldviewer.newsPrefs';
const defaults = { minScore: 0, sort: 'new', original: false };
export const prefs = { ...defaults };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
} catch {
  /* 保存できない環境では既定値のまま */
}

export function setPref(key, value) {
  prefs[key] = value;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* noop */
  }
  dispatchEvent(new Event('newsprefs'));
}

const score = (n) => n.ai?.score ?? 0;

/** 関連度の絞り込みと並び替え */
export function applyPrefs(items) {
  const list = items.filter((n) => score(n) >= prefs.minScore);
  if (prefs.sort === 'rel') list.sort((a, b) => score(b) - score(a) || (b.date ?? '').localeCompare(a.date ?? ''));
  return list;
}

/** 絞り込み・並び替え・原文表示の操作部 */
export function prefControls() {
  const group = (label, key, options) =>
    h(
      'div',
      { class: 'pref', role: 'group', 'aria-label': label },
      h('span', { class: 'pref-label' }, label),
      ...options.map(([value, text]) =>
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(prefs[key] === value), onclick: () => setPref(key, value) }, text),
      ),
    );
  return h(
    'div',
    { class: 'prefs' },
    group('金関連', 'minScore', [[0, 'すべて'], [2, '中以上'], [3, '高のみ']]),
    group('並び', 'sort', [['new', '新着'], ['rel', '関連度']]),
    h(
      'label',
      { class: 'pref-check' },
      h('input', { type: 'checkbox', id: `orig-${Math.random().toString(36).slice(2, 7)}`, checked: prefs.original, onchange: (e) => setPref('original', e.target.checked) }),
      '原文も表示',
    ),
  );
}

/* ---------- 1件分 ---------- */

function relBadge(ai) {
  if (!ai || !REL_LABEL[ai.score]) return null;
  const how = ai.by === 'ai' ? 'AIによる推定' : 'キーワードによる簡易判定';
  return h(
    'span',
    { class: `relbadge s${ai.score}`, title: `金相場との関連度（${how}）${ai.why ? `：${ai.why}` : ''}` },
    `金関連 ${REL_LABEL[ai.score]}`,
    ai.score >= 2 && DIR_LABEL[ai.dir] ? h('span', { class: 'dir' }, DIR_LABEL[ai.dir]) : null,
  );
}

/**
 * ニュース1件の <li>。
 * opts.title: 見出し（Google ニュースの媒体名を除いたものなど）, opts.meta: 行末に足す要素, opts.source: 配信元名
 */
export function newsItem(n, { title = n.title, source, meta = [], summary = n.summary } = {}) {
  const ai = n.ai;
  const translated = ai?.ja && n.lang !== 'ja';
  return h(
    'li',
    { class: `ni s${ai?.score ?? 0}`, lang: translated ? 'ja' : n.lang },
    h('a', { href: n.link, target: '_blank', rel: 'noopener' }, translated ? ai.ja : title),
    translated && prefs.original ? h('div', { class: 'orig', lang: n.lang }, title) : null,
    // 英語の要約は訳していないので、訳がある見出しでは原文表示のときだけ出す
    summary && summary !== n.title && (!translated || prefs.original) ? h('div', { class: 'sum', lang: n.lang }, summary) : null,
    ai?.why && ai.score >= 2 ? h('div', { class: 'why' }, ai.why) : null,
    h(
      'div',
      { class: 'row' },
      relBadge(ai),
      h('span', {}, source),
      n.date ? h('time', { datetime: n.date, title: fmtDate(n.date) }, ago(n.date)) : null,
      translated ? h('span', { class: 'mt', title: '見出しは機械翻訳です' }, '訳') : null,
      ...meta,
    ),
  );
}

/** 関連度の凡例 */
export function relLegend(items) {
  const how = items.some((n) => n.ai?.by === 'ai') ? 'AI推定' : 'キーワードによる簡易判定';
  return h(
    'div',
    { class: 'rel-legend' },
    `金相場との関連度（${how}）:`,
    ...[3, 2, 1].map((s) => h('span', { class: `relbadge s${s}` }, REL_LABEL[s])),
  );
}
