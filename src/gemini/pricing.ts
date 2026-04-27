// Google Gemini API list price (USD per 1M tokens, paid tier の標準価格).
// 出典: https://ai.google.dev/pricing
// Gemini 3 系は preview 期間中で公式価格が未確定の場合があり、暫定値で扱う。
type PriceTable = {
  input: number;
  cachedInput: number;
  output: number; // thinking (thoughts) も output 扱いで課金される
};

const PRICES: Array<{ match: RegExp; price: PriceTable }> = [
  // Gemini 3 系（preview 値、確定後に更新する）
  { match: /gemini-3-pro/i, price: { input: 2, cachedInput: 0.5, output: 12 } },
  { match: /gemini-3-flash/i, price: { input: 0.3, cachedInput: 0.075, output: 2.5 } },
  // Gemini 2.5
  { match: /gemini-2\.5-pro/i, price: { input: 1.25, cachedInput: 0.31, output: 10 } },
  { match: /gemini-2\.5-flash-lite/i, price: { input: 0.1, cachedInput: 0.025, output: 0.4 } },
  { match: /gemini-2\.5-flash/i, price: { input: 0.3, cachedInput: 0.075, output: 2.5 } },
  // Gemini 2.0
  { match: /gemini-2\.0-flash-lite/i, price: { input: 0.075, cachedInput: 0.019, output: 0.3 } },
  { match: /gemini-2\.0-flash/i, price: { input: 0.1, cachedInput: 0.025, output: 0.4 } },
  // 1.5 系（legacy）
  { match: /gemini-1\.5-pro/i, price: { input: 1.25, cachedInput: 0.3125, output: 5 } },
  { match: /gemini-1\.5-flash/i, price: { input: 0.075, cachedInput: 0.019, output: 0.3 } },
];

export const geminiPrice = (model: string): PriceTable | null => {
  for (const p of PRICES) if (p.match.test(model)) return p.price;
  return null;
};

export const geminiCost = (
  model: string,
  t: { input: number; cacheRead: number; output: number; reasoning: number },
): number => {
  const p = geminiPrice(model);
  if (!p) return 0;
  // reader 側で input と cacheRead は排他的になっているのでそのまま掛けるだけ。
  return (
    (t.input * p.input + t.cacheRead * p.cachedInput + (t.output + t.reasoning) * p.output) /
    1_000_000
  );
};
