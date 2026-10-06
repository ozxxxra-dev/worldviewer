// 配信に必要なライブラリと地図データを node_modules から public/vendor にコピーする
import { copyFileSync, mkdirSync } from 'node:fs';
const out = new URL('../public/vendor/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const [from, to] of [
  ['d3/dist/d3.min.js', 'd3.min.js'],
  ['topojson-client/dist/topojson-client.min.js', 'topojson-client.min.js'],
  ['world-atlas/countries-110m.json', 'countries-110m.json'],
]) {
  copyFileSync(new URL(`../node_modules/${from}`, import.meta.url), new URL(to, out));
}
console.log('vendor files copied');
