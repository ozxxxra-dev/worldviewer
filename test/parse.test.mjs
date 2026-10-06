import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFeed } from '../scripts/lib/parse.mjs';
import { makeTagger } from '../scripts/lib/tagger.mjs';
import { buildSnapshot } from '../scripts/lib/snapshot.mjs';

const fx = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const countries = JSON.parse(readFileSync(new URL('../public/data/countries.json', import.meta.url), 'utf8'));

test('RSS 2.0 / RDF / Atom を読める', () => {
  const rss = parseFeed(fx('bbc.xml'));
  assert.equal(rss[0].title, '[Sample] Niger and Nigeria hold border talks');
  assert.equal(rss[0].summary, 'Sample summary & text.');
  assert.equal(rss[0].date, '2026-10-06T09:00:00.000Z');
  assert.equal(parseFeed(fx('dw.xml'))[0].link, 'https://example.com/dw/1');
  assert.equal(parseFeed(fx('un.xml'))[1].link, 'https://example.com/un/2');
  assert.throws(() => parseFeed(fx('guardian.xml')), /unknown feed format/);
});

test('国タグ付け: 部分一致・単語境界の誤検出を避ける', () => {
  const tag = makeTagger(countries);
  const ids = (s) => tag(s).map((id) => countries[id].a2).sort();
  assert.deepEqual(ids('南スーダンで協議'), ['SS']);
  assert.deepEqual(ids('スーダンと南スーダン'), ['SD', 'SS']);
  assert.deepEqual(ids('Nigeria election'), ['NG']);
  assert.deepEqual(ids('Niger and Nigeria'), ['NE', 'NG']);
  assert.deepEqual(ids('米国と中国が会談'), ['CN', 'US']);
  assert.deepEqual(ids('Papua New Guinea floods'), ['PG']);
  assert.deepEqual(ids('a chad of paper'), []);
  assert.deepEqual(ids('Gaza and the West Bank'), ['PS']);
});

test('スナップショット: 失敗源の記録・重複除去・期間外除外', async () => {
  const get = (kind, src) => {
    const ext = kind === 'quakes' || kind === 'fx' ? 'json' : 'xml';
    return fx(`${src.id}.${ext}`);
  };
  const s = await buildSnapshot({ get, countries, now: new Date('2026-10-06T12:00:00Z') });
  const st = Object.fromEntries(s.status.map((x) => [x.id, x.ok]));
  assert.equal(st.guardian, false);
  assert.equal(st.npr, false);
  assert.equal(st.nhk, true);
  assert.ok(!s.news.some((n) => n.link.endsWith('/old')), '48時間より古い記事は除外');
  assert.equal(s.news.filter((n) => n.link === 'https://example.com/nhk/1').length, 1);
  assert.ok(s.news.every((n, i, a) => i === 0 || a[i - 1].date >= n.date), '新しい順');
  assert.equal(s.disasters.length, 2, 'GDACS の地震は除外');
  assert.equal(s.disasters[0].alert, 'red');
  assert.equal(s.quakes[0].mag, 6.1);
  assert.equal(s.fx.rates.JPY, 148.25);
});
