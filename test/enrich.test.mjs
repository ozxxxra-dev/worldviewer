import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichNews, keywordScore, prevMap } from '../scripts/lib/enrich.mjs';

const item = (link, title, lang = 'en') => ({ link, title, lang, summary: '' });

test('keywordScore', () => {
  assert.equal(keywordScore('Gold hits record high'), 3);
  assert.equal(keywordScore('FRBが利下げを決定'), 3);
  assert.equal(keywordScore('Missile strike on port'), 2);
  assert.equal(keywordScore('Election results announced'), 1);
  assert.equal(keywordScore('Football final tonight'), 0);
  assert.equal(keywordScore('Golden State wins'), 0, 'gold は単語単位');
});

test('翻訳キーが無いとき: 関連度のみ・前回の訳は再利用', async () => {
  const items = [item('x', 'Gold prices jump'), item('y', 'Weather today'), item('z', '日本語', 'ja')];
  const stats = await enrichNews(items, { prev: prevMap({ news: [{ link: 'y', ai: { score: 0, ja: '今日の天気', jaBy: 'ms' } }] }) });
  assert.equal(stats.translator, null);
  assert.deepEqual(items[0].ai, { score: 3 });
  assert.deepEqual(items[1].ai, { score: 0, ja: '今日の天気', jaBy: 'ms' });
  assert.equal(items[2].ai.ja, undefined);
});

test('Microsoft Translator: 訳の無い外国語見出しだけを送る', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    assert.match(url, /api\.cognitive\.microsofttranslator\.com\/translate\?api-version=3\.0&to=ja/);
    assert.equal(init.headers['Ocp-Apim-Subscription-Key'], 'k');
    assert.equal(init.headers['Ocp-Apim-Subscription-Region'], 'japaneast');
    const body = JSON.parse(init.body);
    sent.push(...body.map((b) => b.Text));
    return { ok: true, json: async () => body.map((b) => ({ translations: [{ text: `訳:${b.Text}`, to: 'ja' }] })) };
  };
  const items = [item('a', 'Gold rises'), item('b', 'Old one'), item('c', '日本語', 'ja'), item('a', 'Gold rises')];
  const prev = new Map([['b', { score: 0, ja: '前回の訳', jaBy: 'ms' }]]);
  const stats = await enrichNews(items, { prev, ms: { key: 'k', region: 'japaneast' }, fetchImpl });
  assert.deepEqual(sent, ['Gold rises']);
  assert.deepEqual(items[0].ai, { score: 3, ja: '訳:Gold rises', jaBy: 'ms' });
  assert.equal(items[3].ai.ja, '訳:Gold rises', '同じリンクの重複にも付く');
  assert.equal(items[1].ai.ja, '前回の訳');
  assert.equal(items[2].ai.ja, undefined);
  assert.equal(stats.msChars, 'Gold rises'.length);
});

test('Microsoft Translator の失敗は記録して訳なしで続行', async () => {
  const items = [item('a', 'Gold rises')];
  const stats = await enrichNews(items, { ms: { key: 'k' }, fetchImpl: async () => ({ ok: false, status: 403 }) });
  assert.equal(items[0].ai.ja, undefined);
  assert.match(stats.errors[0], /403/);
});
