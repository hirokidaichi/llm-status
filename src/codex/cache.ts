// statusline 向けの軽量キャッシュ。
// codex app-server を毎回 spawn するのは数百ms かかるので、TTL 内はファイル
// 読みだけで返す。書き込み失敗・読み取り失敗は statusline をブロックしない
// よう常に飲み込む（呼び出し側がフォールバックを判断する）。

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { RateLimitsResult } from "./app-server.ts";

const CACHE_DIR = join(homedir(), ".cache", "llm-status");
const CACHE_FILE = join(CACHE_DIR, "codex-limits.json");

export type CachedLimits = { ts: number; data: RateLimitsResult };

export const readCachedLimits = async (): Promise<CachedLimits | null> => {
  try {
    const text = await Bun.file(CACHE_FILE).text();
    const parsed = JSON.parse(text) as Partial<CachedLimits>;
    if (typeof parsed.ts !== "number" || !parsed.data) return null;
    return { ts: parsed.ts, data: parsed.data };
  } catch {
    return null;
  }
};

export const writeCachedLimits = async (data: RateLimitsResult): Promise<void> => {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const payload: CachedLimits = { ts: Date.now(), data };
    await Bun.write(CACHE_FILE, JSON.stringify(payload));
  } catch {
    // best-effort
  }
};
