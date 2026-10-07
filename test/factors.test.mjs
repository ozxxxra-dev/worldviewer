import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFredCsv, scoreSeries, trendFactor, newsTone, buildFactors, FRED_SERIES } from '../scripts/lib/factors.mjs';

const series = (vals) => vals.map((v, i) => [`2025-01-${String((i % 28) + 1).padStart(2, '0')}`, v]);
// ばらつきのある系列の末尾1ヶ月だけ動かす
const wiggle = (n, endDelta) => {
  const v = Array.from({ length: n }, (_, i) => 2 + 0.05 * Math.sin(i * 1.7));
  for (let i = n - 21; i < n; i++) v[i] += (endDelta * (i - (n - 21))) / 20;
  return series(v);
};

test('parseFredCsv: 新旧ヘッダと欠損値', () => {
  assert.deepEqual(parseFredCsv('observation_date,DFII10\n2026-10-01,1.80\n2026-10-02,.\n2026-10-03,\n2026-10-06,1.75\n'), [['2026-10-01', 1.8], ['2026-10-06', 1.75]]);
  assert.deepEqual(parseFredCsv('DATE,X\r\n2026-01-01,3\r\n'), [['2026-01-01', 3]]);
});

test('scoreSeries: 変化の大きさを過去のばらつきで評価し、金にとっての向きに直す', () => {
  assert.equal(scoreSeries(series([1, 2, 3]), 1), null, 'データ不足');
  assert.equal(scoreSeries(series(Array(300).fill(2)), -1).point, 0, '変化なし');
  const bigDrop = scoreSeries(wiggle(300, -0.5), -1); // 実質金利の大幅低下 → 金に +2
  assert.equal(bigDrop.point, 2);
  const bigRise = scoreSeries(wiggle(300, 0.5), -1);
  assert.equal(bigRise.point, -2);
  assert.equal(scoreSeries(wiggle(300, 0.5), 1).point, 2, 'sign=+1 ならそのまま');
});

test('trendFactor', () => {
  const up = Array.from({ length: 250 }, (_, i) => ({ usd: 1000 + i }));
  assert.equal(trendFactor(up).point, 2);
  const down = Array.from({ length: 250 }, (_, i) => ({ usd: 2000 - i }));
  assert.equal(trendFactor(down).point, -2);
  const dip = [...up.slice(0, 240), ...Array.from({ length: 10 }, () => ({ usd: 1100 }))];
  assert.equal(trendFactor(dip).point, 0, '長期上向き・短期割れ');
  assert.equal(trendFactor(up.slice(0, 100)), null);
});

test('newsTone', () => {
  const t = (title) => ({ title });
  assert.equal(newsTone([t('Gold rises'), t('Gold falls')]).point, 0, '5件未満は判定しない');
  const many = [...Array(6)].map(() => t('Gold prices rise to record')).concat([t('金価格が下落')]);
  assert.equal(newsTone(many).point, 2);
  assert.equal(newsTone([...Array(6)].map(() => t('金相場、続落'))).point, -2);
  assert.equal(newsTone([...Array(6)].map(() => t('Gold rises then falls'))).up, 0, '両方含む見出しは数えない');
});

test('buildFactors: 取れなかった指標は除いて −100〜+100 に正規化', () => {
  const fred = { DFII10: wiggle(300, -0.5) }; // 実質金利だけ取れて +2
  const goldHistory = Array.from({ length: 250 }, (_, i) => ({ usd: 1000 + i })); // トレンド +2
  const f = buildFactors({ fred, goldHistory, goldNews: [] });
  assert.equal(f.items.length, FRED_SERIES.length + 2);
  assert.equal(f.items.find((i) => i.key === 'dollar').ok, false);
  assert.equal(f.usable, 2);
  assert.equal(f.total, 100);
  assert.equal(f.verdict, 'up');
});
