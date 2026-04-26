// Claude Code が API レスポンスから取り込んだ rate limit 情報を読む。
// ccsl など他のツールと同じ ~/.claude/.ratelimit_cache.json を参照。
// Anthropic 側で計算された utilization (%) が直接入っているので、
// プラン上限を推測する必要がない。

import { join } from "node:path";
import { homedir } from "node:os";

const CACHE_FILE = join(homedir(), ".claude", ".ratelimit_cache.json");

export type Window = {
  utilization: number; // 0-100
  resetsAt: number | null; // unix epoch ms
};

export type ClaudeRateLimits = {
  fiveHour: Window | null;
  sevenDay: Window | null;
  sevenDayOpus: Window | null;
  sevenDaySonnet: Window | null;
  extraUsage: { utilization: number; usedCredits: number; monthlyLimit: number } | null;
  fetchedAt: number; // unix epoch ms
};

type RawWindow = { utilization?: number; resets_at?: string | null };
type RawData = {
  timestamp?: number;
  data?: {
    five_hour?: RawWindow | null;
    seven_day?: RawWindow | null;
    seven_day_opus?: RawWindow | null;
    seven_day_sonnet?: RawWindow | null;
    extra_usage?: {
      is_enabled?: boolean;
      monthly_limit?: number;
      used_credits?: number;
      utilization?: number;
    } | null;
  };
};

const parseWindow = (w: RawWindow | null | undefined): Window | null => {
  if (!w || typeof w.utilization !== "number") return null;
  let resetsAt: number | null = null;
  if (typeof w.resets_at === "string") {
    const ms = Date.parse(w.resets_at);
    if (!isNaN(ms)) resetsAt = ms;
  }
  return { utilization: w.utilization, resetsAt };
};

export const readClaudeRateLimits = async (): Promise<ClaudeRateLimits | null> => {
  try {
    const text = await Bun.file(CACHE_FILE).text();
    const raw = JSON.parse(text) as RawData;
    const d = raw.data;
    if (!d) return null;
    return {
      fiveHour: parseWindow(d.five_hour),
      sevenDay: parseWindow(d.seven_day),
      sevenDayOpus: parseWindow(d.seven_day_opus),
      sevenDaySonnet: parseWindow(d.seven_day_sonnet),
      extraUsage:
        d.extra_usage?.is_enabled && typeof d.extra_usage.utilization === "number"
          ? {
              utilization: d.extra_usage.utilization,
              usedCredits: d.extra_usage.used_credits ?? 0,
              monthlyLimit: d.extra_usage.monthly_limit ?? 0,
            }
          : null,
      fetchedAt: typeof raw.timestamp === "number" ? raw.timestamp * 1000 : 0,
    };
  } catch {
    return null;
  }
};
