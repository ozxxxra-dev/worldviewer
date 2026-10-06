// ニュース見出しに「日本語訳」と「金相場との関連度」を付ける。
//   関連度: ANTHROPIC_API_KEY があれば Claude、無ければキーワードで推定
//   翻訳:   Claude → Microsoft Translator（無料枠 F0, AZURE_TRANSLATOR_KEY）→ 訳なし の順
// 前回のスナップショットの結果をリンク単位で再利用するので、外部に送るのは新しい見出しだけ。
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const BATCH = 25;

const SYSTEM = `あなたは日本の個人投資家向けに、海外ニュースの見出しを翻訳し、金（ゴールド）相場への影響度を判定するアナリストです。

各見出しについて次を返してください。
- ja: 自然で簡潔な日本語の見出し。日本語の記事は原文のまま返す。固有名詞は日本の報道で一般的な表記にする。
- score: 金相場への関連度
  3 = 金価格を直接動かしうる（金・貴金属市場そのもの、FRBなど主要中銀の金利判断、米CPIなど主要指標、中央銀行の金購入、ドルの急変、大国が関わる戦争や金融危機）
  2 = 間接的に影響しうる（インフレ・景気・為替・関税・地政学的緊張・主要国の財政や政局）
  1 = 関連は弱い（一般的な経済・外交ニュース）
  0 = 関連なし（事件・スポーツ・文化など）
- dir: 金価格にとっての方向。up=上昇要因（リスク回避・利下げ観測・ドル安・インフレ懸念など）、down=下落要因（利上げ観測・ドル高・緊張緩和など）、mixed=どちらもありうる、none=判断できない／無関係
- why: score が 2 以上のとき、判断理由を日本語30字以内で。1 以下は空文字。

見出しから読み取れる範囲で判断し、推測しすぎないでください。`;

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          ja: { type: 'string' },
          score: { type: 'integer', enum: [0, 1, 2, 3] },
          dir: { type: 'string', enum: ['up', 'down', 'mixed', 'none'] },
          why: { type: 'string' },
        },
        required: ['id', 'ja', 'score', 'dir', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/* ---------- キーワードによる簡易判定（API キーが無いとき） ---------- */

const TIERS = [
  [3, /\bgold\b|bullion|precious metal|金価格|金相場|金先物|金地金|貴金属|\bFed\b|Federal Reserve|FOMC|Powell|FRB|rate cut|rate hike|利下げ|利上げ|\bCPI\b|消費者物価|central bank|中央銀行|中銀/i],
  [2, /inflation|インフレ|\bdollar\b|ドル高|ドル安|円安|円高|tariff|関税|\bwar\b|戦争|侵攻|missile|ミサイル|攻撃|strike|sanction|制裁|recession|景気後退|treasury|国債|yield|利回り|debt ceiling|債務|default|nuclear|核|ceasefire|停戦|OPEC|oil price|原油/i],
  [1, /economy|economic|経済|\bGDP\b|trade|貿易|election|選挙|market|市場|stocks|株|bank|銀行|budget|予算/i],
];

export function keywordScore(text) {
  for (const [score, re] of TIERS) if (re.test(text)) return score;
  return 0;
}

/* ---------- Claude による翻訳・採点 ---------- */

async function askClaude(client, model, batch) {
  const lines = batch.map((n, i) => ({ id: i, lang: n.lang, title: n.title, summary: (n.summary ?? '').slice(0, 200) }));
  // Haiku 4.5 は effort と fallbacks を受け付けない
  const haiku = /haiku/.test(model);
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    ...(haiku ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    output_config: { ...(haiku ? {} : { effort: 'low' }), format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `次の${batch.length}件を処理してください。\n${JSON.stringify(lines)}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error('refused');
  if (res.stop_reason === 'max_tokens') throw new Error('output truncated');
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('no text in response');
  const out = new Map();
  for (const r of JSON.parse(text).items) {
    if (batch[r.id]) out.set(batch[r.id].link, { ja: r.ja, score: r.score, dir: r.dir, why: r.why, by: 'ai' });
  }
  return { out, usage: res.usage };
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
 * items に .ai = { ja?, jaBy?, score, dir?, why?, by } を付ける（その場で書き換える）。
 * prev: Map<link, ai>（前回分）。client が null なら関連度はキーワード判定。
 * ms: { key, region } があれば、Claude で訳していない見出しを Microsoft Translator で訳す。
 */
export async function enrichNews(items, { prev = new Map(), client = null, model = DEFAULT_MODEL, maxNew = 200, ms = null, fetchImpl = fetch } = {}) {
  const byLink = new Map();
  for (const n of items) if (!byLink.has(n.link)) byLink.set(n.link, n);
  const unique = [...byLink.values()];

  const result = new Map();
  for (const n of unique) {
    const p = prev.get(n.link);
    if (p?.by === 'ai') result.set(n.link, p);
  }

  const stats = { mode: client ? 'ai' : 'keyword', model: client ? model : null, reused: result.size, added: 0, errors: [], inputTokens: 0, outputTokens: 0 };

  if (client) {
    const todo = unique.filter((n) => !result.has(n.link)).slice(0, maxNew);
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      try {
        const { out, usage } = await askClaude(client, model, batch);
        for (const [k, v] of out) result.set(k, v);
        stats.added += out.size;
        stats.inputTokens += usage?.input_tokens ?? 0;
        stats.outputTokens += usage?.output_tokens ?? 0;
      } catch (e) {
        stats.errors.push(String(e?.message ?? e).slice(0, 200));
      }
    }
  }

  // AI の結果が無いものはキーワードで関連度だけ付ける
  for (const n of items) {
    n.ai = { ...(result.get(n.link) ?? { score: keywordScore(`${n.title} ${n.summary ?? ''}`), by: 'kw' }) };
    if (n.ai.ja && !n.ai.jaBy) n.ai.jaBy = n.ai.by;
    // 日本語記事に訳は不要
    if (n.lang === 'ja') {
      delete n.ai.ja;
      delete n.ai.jaBy;
    }
  }

  // 訳の無い外国語の見出し: 前回の訳を再利用し、残りを Microsoft Translator で訳す
  const untranslated = items.filter((n) => n.lang !== 'ja' && !n.ai.ja);
  for (const n of untranslated) {
    const p = prev.get(n.link);
    if (p?.ja) Object.assign(n.ai, { ja: p.ja, jaBy: p.jaBy ?? p.by });
  }
  stats.translator = ms?.key ? 'microsoft' : null;
  stats.msChars = 0;
  if (ms?.key) {
    const todo = [...new Map(untranslated.filter((n) => !n.ai.ja).map((n) => [n.link, n])).values()].slice(0, maxNew);
    try {
      const ja = await translateMicrosoft(todo.map((n) => n.title), { ...ms, fetchImpl });
      const byLinkJa = new Map(todo.map((n, i) => [n.link, ja[i]]));
      for (const n of untranslated) if (byLinkJa.get(n.link)) Object.assign(n.ai, { ja: byLinkJa.get(n.link), jaBy: 'ms' });
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

export function makeClient() {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}
