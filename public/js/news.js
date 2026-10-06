// ニュース項目の共通表示: 日本語訳・金相場との関連度・表示設定
import { h, ago, fmtDate } from './util.js';

const REL_LABEL = { 3: '高', 2: '中', 1: '低' };

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


/* ---------- ブラウザ内蔵の翻訳（Chrome の Translator API。端末内で動き無料） ---------- */

const BT_KEY = 'worldviewer.bt';
const btCache = new Map();
try {
  for (const [k, v] of JSON.parse(sessionStorage.getItem(BT_KEY) ?? '[]')) btCache.set(k, v);
} catch {
  /* noop */
}
export const bt = { status: 'unsupported', progress: 0 };
let translator = null;
const queue = new Map();
let running = false;

const notify = () => dispatchEvent(new Event('newsprefs'));

/** 起動時: 使えるか調べ、ダウンロード済みならそのまま翻訳を始める */
export async function initBrowserTranslate() {
  if (!('Translator' in self)) return;
  try {
    const a = await self.Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ja' });
    if (a === 'unavailable') return;
    bt.status = a === 'available' ? 'ready' : 'downloadable';
    if (bt.status === 'ready') await startBrowserTranslate();
    else notify();
  } catch {
    /* 使えない環境 */
  }
}

/** 翻訳器を作る。翻訳データのダウンロードが要る場合はボタン操作から呼ぶ */
export async function startBrowserTranslate() {
  try {
    bt.status = 'downloading';
    notify();
    translator = await self.Translator.create({
      sourceLanguage: 'en',
      targetLanguage: 'ja',
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          bt.progress = e.loaded;
          notify();
        });
      },
    });
    bt.status = 'ready';
    notify();
    run();
  } catch (e) {
    bt.status = 'error';
    bt.error = String(e?.message ?? e);
    notify();
  }
}

/** 訳の無い英語見出しを翻訳待ちに入れる（表示中のものだけ） */
export function queueBrowserTranslation(items) {
  if (bt.status === 'unsupported') return;
  for (const n of items) if (n.lang !== 'ja' && !n.ai?.ja && !btCache.has(n.link)) queue.set(n.link, cleanTitle(n));
  run();
}

async function run() {
  if (running || !translator || !queue.size) return;
  running = true;
  let done = 0;
  for (const [link, title] of queue) {
    queue.delete(link);
    try {
      btCache.set(link, await translator.translate(title));
    } catch {
      continue;
    }
    if (++done % 8 === 0) notify();
  }
  running = false;
  try {
    sessionStorage.setItem(BT_KEY, JSON.stringify([...btCache].slice(-500)));
  } catch {
    /* noop */
  }
  if (done) notify();
}

function btControl() {
  if (bt.status === 'downloadable') {
    return h('button', { type: 'button', class: 'chip bt', onclick: startBrowserTranslate }, 'ブラウザ内で翻訳する（無料・初回のみ準備）');
  }
  if (bt.status === 'downloading') return h('span', { class: 'pref-label' }, `翻訳の準備中… ${Math.round(bt.progress * 100)}%`);
  if (bt.status === 'error') return h('span', { class: 'pref-label' }, 'ブラウザ内の翻訳を使えませんでした');
  return null;
}

const score = (n) => n.ai?.score ?? 0;

const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 見出し（Google ニュースの末尾「 - 媒体名」は除く。媒体名は配信元欄に出す） */
export const cleanTitle = (n) => (n.publisher ? n.title.replace(new RegExp(`\\s+-\\s+${escRe(n.publisher)}$`), '') : n.title);

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
    btControl(),
  );
}

/* ---------- 1件分 ---------- */

function relBadge(ai) {
  if (!ai || !REL_LABEL[ai.score]) return null;
  return h('span', { class: `relbadge s${ai.score}`, title: '金相場との関連度（見出しのキーワードによる判定）' }, `金関連 ${REL_LABEL[ai.score]}`);
}

/**
 * ニュース1件の <li>。
 * opts.meta: 行末に足す要素, opts.source: 配信元名
 */
const TRANSLATED_BY = { ms: 'Microsoft Translator による機械翻訳', browser: 'ブラウザ内蔵の機械翻訳' };

export function newsItem(n, { title = cleanTitle(n), source, meta = [], summary = n.summary } = {}) {
  const ai = n.ai;
  const ja = n.lang === 'ja' ? null : (ai?.ja ?? btCache.get(n.link) ?? null);
  const jaBy = ai?.ja ? ai.jaBy : 'browser';
  const translated = !!ja;
  return h(
    'li',
    { class: `ni s${ai?.score ?? 0}`, lang: translated ? 'ja' : n.lang },
    h('a', { href: n.link, target: '_blank', rel: 'noopener' }, translated ? ja : title),
    translated && prefs.original ? h('div', { class: 'orig', lang: n.lang }, title) : null,
    // 英語の要約は訳していないので、訳がある見出しでは原文表示のときだけ出す
    summary && summary !== n.title && (!translated || prefs.original) ? h('div', { class: 'sum', lang: n.lang }, summary) : null,
    h(
      'div',
      { class: 'row' },
      relBadge(ai),
      h('span', {}, source),
      n.date ? h('time', { datetime: n.date, title: fmtDate(n.date) }, ago(n.date)) : null,
      translated ? h('span', { class: 'mt', title: TRANSLATED_BY[jaBy] ?? '機械翻訳' }, '訳') : null,
      ...meta,
    ),
  );
}

/** 関連度の凡例 */
export function relLegend() {
  return h(
    'div',
    { class: 'rel-legend' },
    '金相場との関連度（キーワード判定）:',
    ...[3, 2, 1].map((s) => h('span', { class: `relbadge s${s}` }, REL_LABEL[s])),
  );
}
