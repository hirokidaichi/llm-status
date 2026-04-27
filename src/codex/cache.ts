// statusline 向けの軽量キャッシュ。
// codex app-server を毎回 spawn するのは数百ms かかるので、TTL 内はファイル
// 読みだけで返す。書き込み失敗・読み取り失敗は statusline をブロックしない
// よう常に飲み込む（呼び出し側がフォールバックを判断する）。

import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { RateLimitsResult } from "./app-server.ts";

const CACHE_DIR = join(homedir(), ".cache", "llm-status");
const CACHE_FILE = join(CACHE_DIR, "codex-limits.json");
// 時計が前進した状態でキャッシュが書かれ、その後巻き戻った時の保護。
// Date.now() < ts なら未来 → 5 分以上の skew は信用しない。
const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type CachedLimits = { ts: number; data: RateLimitsResult };

export const readCachedLimits = async (): Promise<CachedLimits | null> => {
  try {
    const text = await Bun.file(CACHE_FILE).text();
    const parsed = JSON.parse(text) as Partial<CachedLimits>;
    if (typeof parsed.ts !== "number" || !parsed.data) return null;
    if (parsed.ts > Date.now() + FUTURE_SKEW_TOLERANCE_MS) return null;
    return { ts: parsed.ts, data: parsed.data };
  } catch {
    return null;
  }
};

export const writeCachedLimits = async (data: RateLimitsResult): Promise<void> => {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const payload: CachedLimits = { ts: Date.now(), data };
    // 同時並行の statusline プロセスが部分書き込み JSON を読んで JSON.parse
     // 失敗 → null 返却で stale fallback も失われるのを防ぐ。
     // 同一ディレクトリ内に temp file を作って rename する POSIX atomic write。
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
