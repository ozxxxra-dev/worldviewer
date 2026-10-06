import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { extractPoint, mergeHistory, readFromTgz, updateHistory, versionOf, toDate } from '../scripts/lib/gold.mjs';

const xau = (date, usd, jpy = usd * 150, xag = 50) => ({ date, xau: { usd, jpy, eur: usd * 0.9, xag } });

test('extractPoint: 各通貨建て価格と銀価格', () => {
  const p = extractPoint(xau('2026-10-06', 4000, 600000, 80));
  assert.equal(p.d, '2026-10-06');
  assert.equal(p.usd, 4000);
  assert.equal(p.jpy, 600000);
  assert.equal(p.xag, 50); // 4000 / 80
  assert.throws(() => extractPoint({ date: 'x', xau: {} }), /no usd/);
});

test('mergeHistory: 日付順・重複は新しい値・1日だけのスパイクを除去', () => {
  const pts = [
    ['2026-01-01', 100], ['2026-01-02', 101], ['2026-01-03', 140], ['2026-01-04', 102], // 3日のスパイク
    ['2026-01-05', 80], ['2026-01-06', 79], // 本当の急落（続く）は残す
  ].map(([d, usd]) => ({ d, usd }));
  const m = mergeHistory([{ d: '2026-01-02', usd: 999 }], pts.reverse());
  assert.deepEqual(m.map((p) => p.d), ['2026-01-01', '2026-01-02', '2026-01-04', '2026-01-05', '2026-01-06']);
  assert.equal(m[1].usd, 101);
});

test('バージョン文字列と日付の相互変換', () => {
  assert.equal(versionOf('2026-01-05'), '2026.1.5');
  assert.equal(toDate('2026.1.5'), '2026-01-05');
});

function makeTgz(path, content) {
  const header = Buffer.alloc(512);
  header.write(path, 0);
  header.write(Buffer.byteLength(content).toString(8).padStart(11, '0') + '\0', 124);
  const body = Buffer.alloc(Math.ceil(Buffer.byteLength(content) / 512) * 512);
  body.write(content);
  return gzipSync(Buffer.concat([header, body, Buffer.alloc(1024)]));
}

test('readFromTgz', () => {
  const tgz = makeTgz('package/v1/currencies/xau.min.json', '{"ok":1}');
  assert.equal(readFromTgz(tgz, 'package/v1/currencies/xau.min.json'), '{"ok":1}');
  assert.throws(() => readFromTgz(tgz, 'nope'), /not found/);
});

test('updateHistory: 未取得の日付だけ取得し、jsDelivr 失敗時は npm にフォールバック', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('currency-api')) {
      return { ok: true, json: async () => ({ versions: { '0.0.9': {}, '2026.10.4': {}, '2026.10.5': {}, '2026.10.6': {} } }) };
    }
    if (url.includes('jsdelivr') && url.includes('2026.10.6')) return { ok: false, status: 503 };
    if (url.includes('jsdelivr')) {
      const v = url.match(/@(\d+\.\d+\.\d+)\//)[1];
      return { ok: true, json: async () => xau(toDate(v), 4000) };
    }
    if (url.endsWith('2026.10.6.tgz')) {
      const buf = makeTgz('package/v1/currencies/xau.min.json', JSON.stringify(xau('2026-10-06', 4100)));
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
    }
    return { ok: false, status: 404 };
  };
  const r = await updateHistory([{ d: '2026-10-04', usd: 3990 }], { fetchImpl });
  assert.deepEqual(r.history.map((p) => [p.d, p.usd]), [['2026-10-04', 3990], ['2026-10-05', 4000], ['2026-10-06', 4100]]);
  assert.equal(r.errors.length, 0);
  assert.ok(!calls.some((u) => u.includes('2026.10.4')), '取得済みの日付は取りに行かない');
});
