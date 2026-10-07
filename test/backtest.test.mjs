import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreHistory, compareFilters, toCsv } from '../scripts/lib/backtest.mjs';

const days = (n, start = '2024-01-01') => {
  const out = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i++, t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

test('scoreHistory: 平日だけで75日線を作り、その日より前の FRED だけを使う', () => {
  const ds = days(400);
  const goldHistory = ds.map((d, i) => ({ d, usd: 1000 + i }));
  // 最後の日にだけ大きく動く系列: その日の評価には使われない（前日までしか見ない）
  const fred = { DFII10: ds.map((d, i) => [d, i === ds.length - 1 ? 100 : 2 + 0.01 * Math.sin(i)]) };
  const rows = scoreHistory({ fred, goldHistory });
  const last = rows.at(-1);
  assert.equal(new Date(`${last.d}T00:00:00Z`).getUTCDay() % 6 !== 0, true);
  assert.ok(Math.abs(last.ma75 - (last.close - 37 * 7 / 5)) < 3, '75平日の平均 ≒ 約105暦日前までの平均');
  assert.notEqual(last.macro, -100, '最終日の急変は先読みしない');
  assert.ok(rows.every((r) => r.close > r.ma75), '上昇相場なので常に75日線より上');
});

test('compareFilters: 向きに従った場合の損益と一致率', () => {
  // 価格が上がり続ける相場で、スコアも常に +50
  const rows = days(60).map((d, i) => ({ d, close: 100 + i, ma75: 90 + i, score: 50, macro: -50 }));
  const r = compareFilters(rows);
  assert.equal(r.filters.score.longDays, 60);
  assert.equal(r.filters.score.horizons[5].hit, 100);
  assert.ok(r.filters.score.horizons[5].follow > 0);
  assert.equal(r.filters.macro.horizons[5].hit, 0, '売り許可で上昇相場は外れ');
  assert.equal(r.agreement.score.sameAsMa75, 100);
  assert.equal(r.agreement.macro.sameAsMa75, 0);
});

test('toCsv は MT4 向けの日付形式', () => {
  assert.equal(toCsv([{ d: '2026-10-06', score: -72, macro: null, close: 4123.456, ma75: 4300 }]), 'date,score,macro,close,ma75\n2026.10.06,-72,,4123.46,4300.00\n');
});
