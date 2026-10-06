import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichNews, keywordScore, prevMap } from '../scripts/lib/enrich.mjs';

const item = (link, title, lang = 'en') => ({ link, title, lang, summary: '' });

function fakeClient(reply, calls = []) {
  return {
    beta: {
      messages: {
        create: async (req) => {
          calls.push(req);
          const batch = JSON.parse(req.messages[0].content.split('\n').slice(1).join('\n'));
          return reply(batch);
        },
      },
    },
  };
}

test('keywordScore', () => {
  assert.equal(keywordScore('Gold hits record high'), 3);
  assert.equal(keywordScore('FRBが利下げを決定'), 3);
  assert.equal(keywordScore('Missile strike on port'), 2);
  assert.equal(keywordScore('Election results announced'), 1);
  assert.equal(keywordScore('Football final tonight'), 0);
  assert.equal(keywordScore('Golden State wins'), 0, 'gold は単語単位');
});

test('Claude で翻訳・採点し、前回分は再利用する', async () => {
  const calls = [];
  const client = fakeClient(
    (batch) => ({
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [{ type: 'text', text: JSON.stringify({ items: batch.map((b) => ({ id: b.id, ja: `訳:${b.title}`, score: 2, dir: 'up', why: '理由' })) }) }],
    }),
    calls,
  );
  const items = [item('a', 'Old news'), item('b', 'New news'), item('c', '日本語の記事', 'ja'), item('b', 'New news')];
  const prev = new Map([['a', { ja: '前回の訳', score: 1, dir: 'none', why: '', by: 'ai' }]]);
  const stats = await enrichNews(items, { prev, client });

  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].messages[0].content.split('\n').slice(1).join('\n'));
  assert.deepEqual(sent.map((s) => s.title), ['New news', '日本語の記事'], '前回分と重複は送らない');
  assert.equal(calls[0].model, 'claude-opus-5-5');
  assert.equal(calls[0].output_config.format.type, 'json_schema');

  assert.equal(items[0].ai.ja, '前回の訳');
  assert.equal(items[1].ai.ja, '訳:New news');
  assert.equal(items[3].ai.ja, '訳:New news', '同じリンクの重複にも付く');
  assert.equal(items[2].ai.ja, undefined, '日本語記事に訳は付けない');
  assert.equal(items[2].ai.score, 2);
  assert.deepEqual([stats.reused, stats.added, stats.inputTokens], [1, 2, 100]);
});

test('API 失敗・拒否時はキーワード判定にフォールバック', async () => {
  const client = fakeClient(() => ({ stop_reason: 'refusal', content: [] }));
  const items = [item('x', 'Gold prices jump')];
  const stats = await enrichNews(items, { client });
  assert.deepEqual(items[0].ai, { score: 3, by: 'kw' });
  assert.equal(stats.errors.length, 1);
});

test('API キーが無いときはキーワード判定のみ・前回の AI 結果は使う', async () => {
  const items = [item('x', 'Gold prices jump'), item('y', 'Weather today')];
  const stats = await enrichNews(items, { prev: prevMap({ news: [{ link: 'y', ai: { score: 0, by: 'ai', ja: '今日の天気' } }] }) });
  assert.equal(stats.mode, 'keyword');
  assert.equal(items[0].ai.by, 'kw');
  assert.equal(items[1].ai.ja, '今日の天気');
});
