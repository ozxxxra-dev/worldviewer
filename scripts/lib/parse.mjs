import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
});

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => {
  if (x == null) return '';
  if (typeof x === 'object') return String(x['#text'] ?? '');
  return String(x);
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// CDATA 内の HTML はパーサーが展開しないので、タグ除去とエンティティ展開をここで行う
export function stripHtml(s) {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function toIso(d) {
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function atomLink(link) {
  const links = arr(link);
  const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') ?? links[0];
  return alt?.['@href'] ?? text(alt);
}

/** RSS 2.0 / RSS 1.0 (RDF) / Atom を共通の記事配列に変換する */
export function parseFeed(xml) {
  const doc = parser.parse(xml);
  let raw;
  if (doc.rss) raw = arr(doc.rss.channel?.item);
  else if (doc['rdf:RDF']) raw = arr(doc['rdf:RDF'].item);
  else if (doc.feed) raw = arr(doc.feed.entry);
  else throw new Error('unknown feed format');

  return raw
    .map((it) => {
      const title = stripHtml(text(it.title));
      const link = doc.feed ? atomLink(it.link) : text(it.link) || text(it.guid);
      const date = toIso(text(it.pubDate || it['dc:date'] || it.updated || it.published));
      const summary = stripHtml(text(it.description || it.summary || it.content)).slice(0, 280);
      const lat = Number(text(it['geo:lat'] ?? it['geo:Point']?.['geo:lat']));
      const lon = Number(text(it['geo:long'] ?? it['geo:Point']?.['geo:long']));
      return { title, link: link.trim(), date, summary, raw: it, lat, lon };
    })
    .filter((x) => x.title && x.link);
}
