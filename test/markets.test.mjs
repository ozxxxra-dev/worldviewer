import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, titleJa } from '../scripts/lib/calendar.mjs';
import { parseCot } from '../scripts/lib/cot.mjs';
import { gvzSummary, realizedVol, volLabel } from '../scripts/lib/volatility.mjs';

test('titleJa: 指標名の訳と前月比などの補足', () => {
  assert.equal(titleJa('Core CPI m/m'), 'コア消費者物価指数（前月比）');
  assert.equal(titleJa('CPI y/y'), '消費者物価指数（前年比）');
  assert.equal(titleJa('Non-Farm Employment Change'), '非農業部門雇用者数');
  assert.equal(titleJa('Some Unknown Index'), null);
});

test('parseCalendar: UTC に揃えて並べ、今週と来週の重複を除く', () => {
  const e = { title: 'CPI m/m', country: 'USD', date: '2026-10-09T08:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '' };
  const later = { ...e, title: 'Retail Sales m/m', date: '2026-10-15T08:30:00-04:00', impact: 'Medium' };
  const out = parseCalendar([[later, e], [e, { title: 'bad', date: 'x' }]]);
  assert.equal(out.length, 2);
  assert.equal(out[0].time, '2026-10-09T12:30:00.000Z');
  assert.equal(out[0].impact, 3);
  assert.equal(out[0].previous, null);
  assert.equal(out[1].impact, 2);
});

test('parseCot: 買い越しと過去3年の中での位置', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    report_date_as_yyyy_mm_dd: `2026-${String(Math.floor(i / 4) + 1).padStart(2, '0')}-${String((i % 4) * 7 + 1).padStart(2, '0')}T00:00:00.000`,
    m_money_positions_long_all: String(100 + i * 10),
    m_money_positions_short_all: '50',
    open_interest_all: '1000',
  })).reverse(); // API は新しい順
  const c = parseCot(rows);
  assert.equal(c.net, 100 + 19 * 10 - 50);
  assert.equal(c.change, 10);
  assert.equal(c.percentile, 100);
  assert.equal(c.netPctOi, 24);
  assert.equal(c.series[0][1], 50);
  assert.throws(() => parseCot(rows.slice(0, 3)), /不足/);
});

test('gvzSummary / realizedVol / volLabel', () => {
  const rows = Array.from({ length: 100 }, (_, i) => [`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, 10 + i * 0.1]);
  const g = gvzSummary(rows);
  assert.equal(g.percentile, 100);
  assert.ok(Math.abs(g.change - 2.1) < 1e-9);
  const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 0, 5) + i * 864e5).toISOString().slice(0, 10));
  const flat = realizedVol(days.map((d) => ({ d, usd: 2000 })));
  assert.equal(flat.value, 0);
  assert.equal(volLabel(85), 'high');
  assert.equal(volLabel(10), 'low');
  assert.equal(volLabel(50), 'normal');
});
