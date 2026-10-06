// ニュース見出しに「金相場との関連度」と、あれば「日本語訳」を付ける。
//   関連度: キーワードで判定
//   翻訳:   AZURE_TRANSLATOR_KEY があれば Microsoft Translator の無料枠（F0）で訳す。無ければ訳なし
//           （訳の無い見出しはブラウザ側で Chrome の内蔵翻訳を使える）
// 前回のスナップショットの訳をリンク単位で再利用するので、翻訳に送るのは新しい見出しだけ。

/* ---------- キーワードによる関連度 ---------- */

const TIERS = [
  [3, /\bgold\b|bullion|precious metal|金価格|金相場|金先物|金地金|貴金属|\bFed\b|Federal Reserve|FOMC|Powell|FRB|rate cut|rate hike|利下げ|利上げ|\bCPI\b|消費者物価|central bank|中央銀行|中銀/i],
  [2, /inflation|インフレ|\bdollar\b|ドル高|ドル安|円安|円高|tariff|関税|\bwar\b|戦争|侵攻|missile|ミサイル|攻撃|strike|sanction|制裁|recession|景気後退|treasury|国債|yield|利回り|debt ceiling|債務|default|nuclear|核|ceasefire|停戦|OPEC|oil price|原油/i],
  [1, /economy|economic|経済|\bGDP\b|trade|貿易|election|選挙|market|市場|stocks|株|bank|銀行|budget|予算/i],
];

export function keywordScore(text) {
  for (const [score, re] of TIERS) if (re.test(text)) return score;
  return 0;
}

/* ---------- Microsoft Translator（無料枠 F0: 月200万文字。超えると止まるだけで課金されない） ---------- */

const MS_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=ja';

export async function translateMicrosoft(texts, { key, region, fetchImpl = fetch }) {
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const res = await fetchImpl(MS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        ...(region ? { 'Ocp-Apim-Subscription-Region': region } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk.map((Text) => ({ Text }))),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Microsoft Translator HTTP ${res.status}`);
    const j = await res.json();
    out.push(...j.map((r) => r.translations?.[0]?.text ?? null));
  }
  return out;
}

/**
 * items に .ai = { score, ja?, jaBy? } を付ける（その場で書き換える）。
 * prev: Map<link, ai>（前回分の訳の再利用）。ms: { key, region } があれば新しい見出しを翻訳。
 */
export async function enrichNews(items, { prev = new Map(), maxNew = 200, ms = null, fetchImpl = fetch } = {}) {
  const stats = { translator: ms?.key ? 'microsoft' : null, reused: 0, translated: 0, msChars: 0, errors: [] };

  for (const n of items) {
    n.ai = { score: keywordScore(`${n.title} ${n.summary ?? ''}`) };
    const p = prev.get(n.link);
    if (n.lang !== 'ja' && p?.ja) {
      Object.assign(n.ai, { ja: p.ja, jaBy: p.jaBy ?? 'ms' });
      stats.reused++;
    }
  }

  if (ms?.key) {
    const todo = [...new Map(items.filter((n) => n.lang !== 'ja' && !n.ai.ja).map((n) => [n.link, n])).values()].slice(0, maxNew);
    try {
      const ja = await translateMicrosoft(todo.map((n) => n.title), { ...ms, fetchImpl });
      const byLink = new Map(todo.map((n, i) => [n.link, ja[i]]));
      for (const n of items) if (!n.ai.ja && byLink.get(n.link)) Object.assign(n.ai, { ja: byLink.get(n.link), jaBy: 'ms' });
      stats.translated = todo.length;
      stats.msChars = todo.reduce((a, n) => a + n.title.length, 0);
    } catch (e) {
      stats.errors.push(String(e?.message ?? e).slice(0, 200));
    }
  }
  return stats;
}

/** 前回スナップショットから link → ai の対応表を作る */
export function prevMap(snapshot) {
  const m = new Map();
  for (const n of [...(snapshot?.news ?? []), ...(snapshot?.goldNews ?? [])]) if (n.ai) m.set(n.link, n.ai);
  return m;
}
