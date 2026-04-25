// OpenAI API list price (USD per 1M tokens). Codex Pro/Plus 定額契約の場合は参考値。
// 出典: https://openai.com/api/pricing (2026-04 時点に確認できた数値を反映)
type PriceTable = {
  input: number;
  cachedInput: number;
  output: number;
};

const PRICES: Array<{ match: RegExp; price: PriceTable }> = [
  // GPT-5 / GPT-5-codex 系列
  { match: /gpt-5-codex/i, price: { input: 1.25, cachedInput: 0.125, output: 10 } },
  { match: /gpt-5\.3/i, price: { input: 1.25, cachedInput: 0.125, output: 10 } },
  { match: /gpt-5/i, price: { input: 1.25, cachedInput: 0.125, output: 10 } },
  // GPT-4.1 系
  { match: /gpt-4\.1-mini/i, price: { input: 0.4, cachedInput: 0.1, output: 1.6 } },
  { match: /gpt-4\.1/i, price: { input: 2, cachedInput: 0.5, output: 8 } },
  // o-series (reasoning)
  { match: /o3-mini/i, price: { input: 1.1, cachedInput: 0.275, output: 4.4 } },
  { match: /o3/i, price: { input: 2, cachedInput: 0.5, output: 8 } },
  { match: /o4-mini/i, price: { input: 1.1, cachedInput: 0.275, output: 4.4 } },
];

export const codexPrice = (model: string): PriceTable | null => {
  for (const p of PRICES) if (p.match.test(model)) return p.price;
  return null;
};

export const codexCost = (
  model: string,
  t: { input: number; cacheRead: number; output: number; reasoning: number },
): number => {
  const p = codexPrice(model);
  if (!p) return 0;
  // OpenAI は reasoning_output_tokens も output 課金
  const billedInput = Math.max(0, t.input - t.cacheRead);
  return (
    (billedInput * p.input + t.cacheRead * p.cachedInput + (t.output + t.reasoning) * p.output) /
    1_000_000
  );
};
