// Codex の 5h/週次窓を 1 セグメントとして整形する。app-server spawn は遅いので
// 既存の TTL 60s ファイルキャッシュ越しに読む。失敗時は古いキャッシュにフォールバック。

import { readCodexRateLimits, type RateBlock, type RateLimitsResult } from "../codex/app-server.ts";
import { readCachedLimits, writeCachedLimits } from "../codex/cache.ts";
import { c, fmtPct } from "../format/colors.ts";

const CACHE_TTL_MS = 60_000;
const STATUSLINE_RPC_TIMEOUT_MS = 3_000;

export type CodexFormat = "minimal" | "compact" | "full";

const fmtWindow = (mins: number): string => {
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (60 * 24))}d`;
};

const fmtUntil = (resetsAtSec: number): string => {
  const diffMs = resetsAtSec * 1000 - Date.now();
  if (diffMs <= 0) return "now";
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
};

const pickBlock = (data: RateLimitsResult): RateBlock | null => {
  if (data.rateLimits) return data.rateLimits;
  const vals = Object.values(data.rateLimitsByLimitId ?? {});
  return vals[0] ?? null;
};

export const renderCodex = (data: RateLimitsResult | null, format: CodexFormat): string => {
  const label = `${c.magenta("⚡")} ${c.bold(c.magenta("Codex"))}`;
  const dash = format === "minimal" ? c.dim("—") : `${label} ${c.dim("—")}`;
  if (!data) return dash;
  const block = pickBlock(data);
  if (!block) return dash;

  const parts: string[] = [];
  for (const w of [block.primary, block.secondary]) {
    if (!w) continue;
    const win = c.dim(fmtWindow(w.windowDurationMins));
    const pct = c.bold(fmtPct(w.usedPercent));
    if (format === "minimal") parts.push(`${win}:${pct}`);
    else if (format === "compact") parts.push(`${win} ${pct}`);
    else parts.push(`${win} ${pct}${c.dim(`(${fmtUntil(w.resetsAt)})`)}`);
  }
  if (parts.length === 0) return dash;

  const sep = format === "minimal" ? " " : c.dim(" / ");
  const body = parts.join(sep);
  return format === "minimal" ? body : `${label} ${body}`;
};

export const codexSegment = async (format: CodexFormat): Promise<string> => {
  const cached = await readCachedLimits();
  const fresh = cached !== null && Date.now() - cached.ts < CACHE_TTL_MS;

  let data: RateLimitsResult | null = null;
  if (fresh) {
    data = cached.data;
  } else {
    try {
      data = await readCodexRateLimits({ timeoutMs: STATUSLINE_RPC_TIMEOUT_MS });
      await writeCachedLimits(data);
    } catch {
      data = cached?.data ?? null;
    }
  }
  return renderCodex(data, format);
};
