export type Provider = "claude" | "codex";

export type TokenBreakdown = {
  input: number;
  cacheCreation: number;
  cacheRead: number;
  output: number;
  reasoning: number;
};

export type UsageEntry = {
  provider: Provider;
  timestamp: Date;
  model: string;
  sessionId: string;
  requestId?: string;
  tokens: TokenBreakdown;
  costUsd: number;
};

export type DailyBucket = {
  date: string;
  provider: Provider;
  entries: number;
  tokens: TokenBreakdown;
  costUsd: number;
  models: Set<string>;
};

export type SessionBucket = {
  sessionId: string;
  provider: Provider;
  firstTs: Date;
  lastTs: Date;
  entries: number;
  tokens: TokenBreakdown;
  costUsd: number;
  models: Set<string>;
};

export const emptyTokens = (): TokenBreakdown => ({
  input: 0,
  cacheCreation: 0,
  cacheRead: 0,
  output: 0,
  reasoning: 0,
});

export const addTokens = (a: TokenBreakdown, b: TokenBreakdown): TokenBreakdown => ({
  input: a.input + b.input,
  cacheCreation: a.cacheCreation + b.cacheCreation,
  cacheRead: a.cacheRead + b.cacheRead,
  output: a.output + b.output,
  reasoning: a.reasoning + b.reasoning,
});

export const totalTokens = (t: TokenBreakdown): number =>
  t.input + t.cacheCreation + t.cacheRead + t.output + t.reasoning;
