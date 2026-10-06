const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * countries.json から国タグ付け関数を作る。
 * 長いキーワードから順に照合し、一致した部分を伏せることで
 * 「南スーダン」が「スーダン」にも一致する、といった二重計上を防ぐ。
 */
export function makeTagger(countries) {
  const entries = [];
  for (const [id, c] of Object.entries(countries)) {
    for (const k of c.kw.ja) entries.push({ id, re: new RegExp(escapeRe(k), 'g'), len: k.length });
    for (const k of c.kw.en) {
      // 英語は大文字小文字を区別し単語境界で照合（"Chad" と "chad"、"Niger" と "Nigeria" の区別）
      entries.push({ id, re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(k)}(?![\\p{L}\\p{N}])`, 'gu'), len: k.length });
    }
  }
  entries.sort((a, b) => b.len - a.len);

  return function tag(textIn) {
    let t = textIn;
    const found = new Set();
    for (const e of entries) {
      e.re.lastIndex = 0;
      if (e.re.test(t)) {
        found.add(e.id);
        e.re.lastIndex = 0;
        t = t.replace(e.re, (m) => '\u0000'.repeat(m.length));
      }
    }
    return [...found];
  };
}
