import { addTokens, emptyTokens, type DailyBucket, type SessionBucket, type UsageEntry } from "../types.ts";

export const dateKey = (d: Date): string => {
  // ローカルタイムゾーン基準で YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const groupDaily = (entries: UsageEntry[]): DailyBucket[] => {
  const map = new Map<string, DailyBucket>();
  for (const e of entries) {
    const key = `${dateKey(e.timestamp)}::${e.provider}`;
    let b = map.get(key);
    if (!b) {
      b = {
        date: dateKey(e.timestamp),
        provider: e.provider,
        entries: 0,
        tokens: emptyTokens(),
        costUsd: 0,
        models: new Set<string>(),
      };
      map.set(key, b);
    }
    b.entries += 1;
    b.tokens = addTokens(b.tokens, e.tokens);
    b.costUsd += e.costUsd;
    b.models.add(e.model);
  }
  return [...map.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.provider.localeCompare(b.provider),
  );
};

export const groupSession = (entries: UsageEntry[]): SessionBucket[] => {
  const map = new Map<string, SessionBucket>();
  for (const e of entries) {
    const key = `${e.provider}::${e.sessionId}`;
    let b = map.get(key);
    if (!b) {
      b = {
        sessionId: e.sessionId,
        provider: e.provider,
        firstTs: e.timestamp,
        lastTs: e.timestamp,
        entries: 0,
        tokens: emptyTokens(),
        costUsd: 0,
        models: new Set<string>(),
      };
      map.set(key, b);
    }
    b.entries += 1;
    b.tokens = addTokens(b.tokens, e.tokens);
    b.costUsd += e.costUsd;
    b.models.add(e.model);
    if (e.timestamp < b.firstTs) b.firstTs = e.timestamp;
    if (e.timestamp > b.lastTs) b.lastTs = e.timestamp;
  }
  return [...map.values()].sort((a, b) => b.lastTs.getTime() - a.lastTs.getTime());
};

export const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const startOfDaysAgo = (n: number): Date => {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
};
