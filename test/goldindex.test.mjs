import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoldIndex, geoCount } from '../scripts/lib/goldindex.mjs';

const now = new Date('2026-10-08T00:00:00Z');

test('geoCount: 紛争・軍事関連の見出しを数える', () => {
  assert.equal(geoCount([{ title: 'Missile attack on port' }, { title: 'イスラエルが空爆' }, { title: 'Stocks rise' }, { title: 'Warsaw marathon' }]), 2);
});

test('方向: 要因スコア・投機筋（逆張り）を重み付きで平均。地政学は履歴が貯まるまで使わない', () => {
  const g = buildGoldIndex({ factors: { usable: 6, total: -80 }, cot: { percentile: 95 }, now });
  // (-80*0.6 + -100*0.2) / 0.8 = -85
  assert.equal(g.value, -85);
  assert.equal(g.verdict, 'down');
  assert.equal(g.parts.find((p) => p.key === 'geo').ok, false);
  assert.equal(g.history.length, 1);
  assert.equal(g.history[0].value, -85);
});

test('地政学: 履歴と比べて紛争ニュースが多いとプラス（安全資産）', () => {
  const prevHistory = Array.from({ length: 30 }, (_, i) => ({ t: `h${i}`, geo: 2 }));
  const news = Array.from({ length: 8 }, () => ({ title: 'War escalates' }));
  const g = buildGoldIndex({ factors: { usable: 0 }, news, prevHistory, now });
  assert.equal(g.geo.percentile, 100);
  assert.equal(g.value, 100);
  assert.equal(g.history.length, 31);
});

test('警戒度: 24時間以内の米重要指標と値動きの荒さ', () => {
  const calendar = [
    { country: 'USD', impact: 3, time: '2026-10-07T12:00:00Z', title: 'past' },
    { country: 'EUR', impact: 3, time: '2026-10-08T06:00:00Z', title: 'eur' },
    { country: 'USD', impact: 3, time: '2026-10-08T12:30:00Z', title: 'CPI m/m', ja: '消費者物価指数（前月比）' },
  ];
  const g = buildGoldIndex({ factors: { usable: 1, total: 0 }, volatility: { gvz: { percentile: 30 } }, calendar, now });
  // (30*0.4 + 100*0.35) / 0.75 = 62.7
  assert.equal(g.caution.value, 63);
  assert.equal(g.caution.level, 'high');
  assert.equal(g.caution.nextEvent.title, '消費者物価指数（前月比）');
  assert.equal(g.caution.nextEvent.hours, 13);
});

test('履歴は上限で切り詰める', () => {
  const prevHistory = Array.from({ length: 2500 }, (_, i) => ({ t: `h${i}`, geo: 0 }));
  assert.equal(buildGoldIndex({ prevHistory, now }).history.length, 2000);
});
