// statusline の各セグメント。データが無いセグメントは空文字を返し、
// オーケストレーターがフィルタする。

import { c } from "../format/colors.ts";
import { type StatuslineInput, inputCwd } from "./input.ts";
import { readContextSize } from "./transcript.ts";
import {
  gitBranch,
  gitStatus,
  gitDiffShortstat,
  gitRepoSlug,
  countUntracked,
} from "./git.ts";
import { haikuGitSummary } from "./haiku.ts";
import { codexSegment, type CodexFormat } from "./codex.ts";
import { readClaudeRateLimits, type Window } from "./claude-ratelimit.ts";
import { getGeminiStats, formatTokens } from "./gemini-stats.ts";

export type SegmentName =
  | "model"
  | "ctx"
  | "5h"
  | "7d"
  | "7d_opus"
  | "7d_sonnet"
  | "branch"
  | "codex"
  | "gemini"
  | "gitstats"
  | "gitsummary"
  | "git";

const colorPct = (p: number): string => {
  const s = `${p.toFixed(0)}%`;
  if (p >= 80) return c.bold(c.red(s));
  if (p >= 50) return c.bold(c.yellow(s));
  return c.bold(c.green(s));
};

const fmtUntil = (resetsAtMs: number): string => {
  const diff = resetsAtMs - Date.now();
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
};

const renderWindow = (icon: string, label: string, w: Window | null): string => {
  if (!w) return "";
  const stale = w.resetsAt != null && w.resetsAt < Date.now();
  if (stale) {
    // 古い window 情報。値だけ dim で出して、リセット時刻は表示しない
    return `${c.dim(icon)} ${c.dim(label)} ${c.dim(`${w.utilization.toFixed(0)}%`)} ${c.dim("(stale)")}`;
  }
  const tail = w.resetsAt != null ? ` ${c.dim(`(${fmtUntil(w.resetsAt)})`)}` : "";
  return `${icon} ${c.dim(label)} ${colorPct(w.utilization)}${tail}`;
};

export const modelSegment = (input: StatuslineInput | null): string => {
  const name = input?.model?.display_name ?? input?.model?.id;
  if (!name) return "";
  return `${c.cyan("🤖")} ${c.bold(c.cyan(name))}`;
};

export const ctxSegment = async (input: StatuslineInput | null): Promise<string> => {
  if (!input?.transcript_path) return "";
  // 実測値を最優先。exceeds_200k_tokens フラグは transcript が読めない時の
  // フォールバックとしてのみ使う（1M context のモデルだと 210k=21% でも
  // フラグは true になるが、それは赤字警告するほどの値ではない）
  const size = await readContextSize(input.transcript_path);
  if (size) {
    const pct = (size.used / size.max) * 100;
    return `🧠 ${c.dim("ctx")} ${colorPct(pct)}`;
  }
  if (input.exceeds_200k_tokens) {
    return `${c.bold(c.yellow("🧠"))} ${c.bold(c.yellow("ctx >200k"))}`;
  }
  return "";
};

export const fiveHourSegment = async (): Promise<string> => {
  const r = await readClaudeRateLimits();
  return renderWindow("⏱", "5h", r?.fiveHour ?? null);
};

export const sevenDaySegment = async (): Promise<string> => {
  const r = await readClaudeRateLimits();
  return renderWindow("📅", "7d", r?.sevenDay ?? null);
};

export const sevenDayOpusSegment = async (): Promise<string> => {
  const r = await readClaudeRateLimits();
  return renderWindow("🅾", "7d Opus", r?.sevenDayOpus ?? null);
};

export const sevenDaySonnetSegment = async (): Promise<string> => {
  const r = await readClaudeRateLimits();
  return renderWindow("🅢", "7d Sonnet", r?.sevenDaySonnet ?? null);
};

export const branchSegment = async (input: StatuslineInput | null): Promise<string> => {
  const cwd = inputCwd(input);
  const [b, slug] = await Promise.all([gitBranch(cwd), gitRepoSlug(cwd)]);
  if (!b) return "";
  const label = slug ? `${c.green(slug)} ${c.dim(`(${b})`)}` : c.green(b);
  return `${c.green("🌿")} ${label}`;
};

export const gitstatsSegment = async (input: StatuslineInput | null): Promise<string> => {
  const cwd = inputCwd(input);
  const [stat, status] = await Promise.all([gitDiffShortstat(cwd), gitStatus(cwd)]);
  if (!stat) return "";
  const untracked = status ? countUntracked(status) : 0;
  const totalFiles = stat.files + untracked;
  if (totalFiles === 0 && stat.insertions === 0 && stat.deletions === 0) return "";
  const parts: string[] = [];
  parts.push(`${c.bold(c.yellow(String(totalFiles)))}${c.dim(" files")}`);
  if (stat.insertions > 0) parts.push(c.bold(c.green(`+${stat.insertions}`)));
  if (stat.deletions > 0) parts.push(c.bold(c.red(`-${stat.deletions}`)));
  if (untracked > 0) parts.push(c.dim(`(${untracked} new)`));
  return `📝 ${parts.join(" ")}`;
};

export const gitsummarySegment = async (input: StatuslineInput | null): Promise<string> => {
  const summary = await haikuGitSummary(inputCwd(input));
  if (!summary) return "";
  return c.italic(summary);
};

// Gemini はクォータ取得 API が無いため、ローカルログから直近の利用「実数」だけ
// 出す。％ は出さない（嘘になる）。データが無い場合は空文字。
export const geminiSegment = async (): Promise<string> => {
  const s = await getGeminiStats();
  if (!s) return "";
  if (s.day7.tokens === 0) return "";
  const day1 = formatTokens(s.day1.tokens);
  const day7 = formatTokens(s.day7.tokens);
  return `${c.magenta("♊")} ${c.dim("Gemini")} ${c.bold(c.magenta("24h"))} ${day1} ${c.dim("·")} ${c.bold(c.magenta("7d"))} ${day7}`;
};

// gitstats と gitsummary を「：」で結合した複合セグメント。デフォルト推奨。
export const gitSegment = async (input: StatuslineInput | null): Promise<string> => {
  const [stats, summary] = await Promise.all([
    gitstatsSegment(input),
    gitsummarySegment(input),
  ]);
  if (!stats) return summary;
  if (!summary) return stats;
  return `${stats} ${c.dim("：")} ${summary}`;
};

export const renderSegment = async (
  name: SegmentName,
  input: StatuslineInput | null,
  codexFormat: CodexFormat,
): Promise<string> => {
  switch (name) {
    case "model":
      return modelSegment(input);
    case "ctx":
      return ctxSegment(input);
    case "5h":
      return fiveHourSegment();
    case "7d":
      return sevenDaySegment();
    case "7d_opus":
      return sevenDayOpusSegment();
    case "7d_sonnet":
      return sevenDaySonnetSegment();
    case "branch":
      return branchSegment(input);
    case "codex":
      return codexSegment(codexFormat);
    case "gemini":
      return geminiSegment();
    case "gitstats":
      return gitstatsSegment(input);
    case "gitsummary":
      return gitsummarySegment(input);
    case "git":
      return gitSegment(input);
  }
};
