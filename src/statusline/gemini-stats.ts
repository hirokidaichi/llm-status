// Gemini の利用「実数」を 24h / 7d で集計して statusline に表示するための
// モジュール。Gemini API は残量ヘッダーやクォータ取得 API を提供しないため、
// ローカルログから実数だけを出す方針（％ や残量は推測しない）。
//
// statusline は Claude Code から呼び出されるたびに新プロセスで動くので、
// 集計結果は ~/.cache/llm-status/gemini-stats.json に TTL 60s でキャッシュする。

import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadGeminiUsage } from "../gemini/reader.ts";
import { totalTokens } from "../types.ts";

const CACHE_DIR = join(homedir(), ".cache", "llm-status");
const CACHE_FILE = join(CACHE_DIR, "gemini-stats.json");
const CACHE_TTL_MS = 60_000;
const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type GeminiWindow = { tokens: number; messages: number };
export type GeminiStats = {
  day1: GeminiWindow;
  day7: GeminiWindow;
  fetchedAt: number;
};

type Cached = { ts: number; data: GeminiStats };

const isValidWindow = (w: unknown): w is GeminiWindow =>
  typeof w === "object" &&
  w !== null &&
  typeof (w as GeminiWindow).tokens === "number" &&
  typeof (w as GeminiWindow).messages === "number";

const isValidStats = (d: unknown): d is GeminiStats => {
  if (typeof d !== "object" || d === null) return false;
  const s = d as Partial<GeminiStats>;
  return isValidWindow(s.day1) && isValidWindow(s.day7) && typeof s.fetchedAt === "number";
};

const readCache = async (): Promise<GeminiStats | null> => {
  try {
    const text = await Bun.file(CACHE_FILE).text();
    const parsed = JSON.parse(text) as Partial<Cached>;
    if (typeof parsed.ts !== "number") return null;
    const now = Date.now();
    if (parsed.ts > now + FUTURE_SKEW_TOLERANCE_MS) return null;
    if (now - parsed.ts > CACHE_TTL_MS) return null;
    if (!isValidStats(parsed.data)) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const writeCache = async (data: GeminiStats): Promise<void> => {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const payload: Cached = { ts: Date.now(), data };
    const tmp = `${CACHE_FILE}.tmp.${process.pid}.${Date.now()}`;
    await Bun.write(tmp, JSON.stringify(payload));
    try {
      await rename(tmp, CACHE_FILE);
    } catch (e) {
      try { await unlink(tmp); } catch {}
      throw e;
    }
  } catch {
    // best-effort
  }
};

const compute = async (now: number): Promise<GeminiStats> => {
  const since = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const entries = await loadGeminiUsage({ since });
  const day1Cutoff = now - 24 * 60 * 60 * 1000;
  const acc: GeminiStats = {
    day1: { tokens: 0, messages: 0 },
    day7: { tokens: 0, messages: 0 },
    fetchedAt: now,
  };
  for (const e of entries) {
    const tok = totalTokens(e.tokens);
    acc.day7.tokens += tok;
    acc.day7.messages += 1;
    if (e.timestamp.getTime() >= day1Cutoff) {
      acc.day1.tokens += tok;
      acc.day1.messages += 1;
    }
  }
  return acc;
};

let inflight: Promise<GeminiStats> | null = null;

export const getGeminiStats = async (): Promise<GeminiStats | null> => {
  const cached = await readCache();
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const data = await compute(Date.now());
    await writeCache(data);
    return data;
  })();
  try {
    return await inflight;
  } catch {
    return null;
  } finally {
    inflight = null;
  }
};

/**
 * 1234 → "1.2k", 1234567 → "1.2M". 1000 未満はそのまま整数。
 */
export const formatTokens = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
};
