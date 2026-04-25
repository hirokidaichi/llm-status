// Anthropic API list price (USD per 1M tokens). Pro/Max定額契約の場合は参考値。
// https://www.anthropic.com/pricing
type PriceTable = {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
};

const PRICES: Array<{ match: RegExp; price: PriceTable }> = [
  // Opus 4 / 4.x
  { match: /opus-4/i, price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  // Sonnet 4 / 4.x
  { match: /sonnet-4/i, price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  // Haiku 4 / 4.5
  { match: /haiku-4/i, price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
  // legacy 3.5/3.7
  { match: /sonnet-3/i, price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: /haiku-3/i, price: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 } },
  { match: /opus-3/i, price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
];

export const claudePrice = (model: string): PriceTable | null => {
  for (const p of PRICES) if (p.match.test(model)) return p.price;
  return null;
};

export const claudeCost = (
  model: string,
  t: { input: number; cacheCreation: number; cacheRead: number; output: number },
): number => {
  const p = claudePrice(model);
  if (!p) return 0;
  return (
    (t.input * p.input + t.output * p.output + t.cacheCreation * p.cacheWrite + t.cacheRead * p.cacheRead) /
    1_000_000
  );
};
