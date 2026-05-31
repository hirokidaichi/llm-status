// statusline の各セグメント。データが無いセグメントは空文字を返し、
// オーケストレーターがフィルタする。

import { c, muted } from "../format/colors.ts";
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

// 使用率 p(%) → 着色関数。残量が少ない（=使用率が高い）ほど赤に寄せる。
const pctColor = (p: number): ((s: string) => string) => {
  if (p >= 80) return (s) => c.bold(c.red(s));
  if (p >= 50) return (s) => c.bold(c.yellow(s));
  return (s) => c.bold(c.green(s));
};

// バッテリー残量ゲージ。p は「使用率%」を受け取り、バーも数字も **残量** を表示する
// （本物の電池と同じく満タン→空、残り何%かを示す）。色は残量が少ない（＝使用率が
// 高い）ほど赤に寄せる。例: 使用 17% → 残 83% → [████░] 83%。
const BATTERY_CELLS = 5;
export const battery = (p: number): string => {
  const used = Math.max(0, Math.min(100, p));
  const remaining = 100 - used;
  const filled = Math.round((remaining / 100) * BATTERY_CELLS);
  const empty = BATTERY_CELLS - filled;
  const color = pctColor(used);
  const bar = color("█".repeat(filled)) + muted("░".repeat(empty));
  return `${muted("[")}${bar}${muted("]")} ${color(`${remaining.toFixed(0)}%`)}`;
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
    return `${muted(icon)} ${muted(label)} ${muted(`${(100 - w.utilization).toFixed(0)}%`)} ${muted("(stale)")}`;
  }
  const tail = w.resetsAt != null ? ` ${muted(`(${fmtUntil(w.resetsAt)})`)}` : "";
  return `${icon} ${muted(label)} ${battery(w.utilization)}${tail}`;
};

// Claude Code が stdin で渡す rate_limits の 1 window を Window 型へ。
// resets_at は **Unix epoch 秒**なので ms に直す（cache の ISO 文字列とは別形式）。
export const fromStdinWindow = (
  w: { used_percentage?: number; resets_at?: number } | null | undefined,
): Window | null => {
  if (!w || typeof w.used_percentage !== "number") return null;
  const resetsAt = typeof w.resets_at === "number" ? w.resets_at * 1000 : null;
  return { utilization: w.used_percentage, resetsAt };
};

export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
export const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;

// .ratelimit_cache.json 由来 window の鮮度チェック。最近の Claude Code は
// この cache を更新しなくなった（rate limit ヘッダーは in-memory 保持のみ）ため、
// fetchedAt が window 期間より古い＝既にリセット済みで値が無意味なら null を返して
// 非表示にする。これが無いと何日も前の値（例: 7d 20%）を固定表示し続けてしまう。
export const freshFromCache = (
  w: Window | null,
  fetchedAt: number,
  maxAgeMs: number,
): Window | null => {
  if (!w) return null;
  if (!fetchedAt || Date.now() - fetchedAt > maxAgeMs) return null;
  return w;
};

export const modelSegment = (input: StatuslineInput | null): string => {
  const name = input?.model?.display_name ?? input?.model?.id;
  if (!name) return "";
  return `${c.cyan("🤖")} ${c.bold(c.cyan(name))}`;
};

export const ctxSegment = async (input: StatuslineInput | null): Promise<string> => {
  // 1) Claude Code が stdin で渡す context_window を最優先。
  //    used_percentage は input-only で事前計算済みなので最も正確。
  //    model から context window サイズを推測する必要がなく、1M モデル
  //    (opus-4-8[1m] 等) でも正しい％になる。
  const cw = input?.context_window;
  if (cw) {
    if (typeof cw.used_percentage === "number") {
      return `🧠 ${muted("ctx")} ${battery(cw.used_percentage)}`;
    }
    // used_percentage が null（session 序盤 / compact 直後）でも、
    // token 数と window サイズが揃えば自前で計算する。
    const size = cw.context_window_size;
    const used = cw.total_input_tokens;
    if (typeof size === "number" && size > 0 && typeof used === "number") {
      return `🧠 ${muted("ctx")} ${battery((used / size) * 100)}`;
    }
  }
  // 2) context_window が無い古い Claude Code 向けフォールバック: transcript を読む。
  //    stdin に window サイズだけ来ている場合はそれを max に優先採用する。
  if (input?.transcript_path) {
    const sz = await readContextSize(input.transcript_path);
    if (sz) {
      const max =
        typeof cw?.context_window_size === "number" && cw.context_window_size > 0
          ? cw.context_window_size
          : sz.max;
      return `🧠 ${muted("ctx")} ${battery((sz.used / max) * 100)}`;
    }
  }
  // 3) 最終フォールバック: フラグだけ。1M モデルだと 200k 超でも 21% 程度なので
  //    赤字にはせず黄色で控えめに警告する。
  if (input?.exceeds_200k_tokens) {
    return `${c.bold(c.yellow("🧠"))} ${c.bold(c.yellow("ctx >200k"))}`;
  }
  return "";
};

export const fiveHourSegment = async (input: StatuslineInput | null): Promise<string> => {
  // stdin の rate_limits を最優先（Claude.ai Pro/Max で初回 API 応答後に来る）。
  const live = fromStdinWindow(input?.rate_limits?.five_hour);
  if (live) return renderWindow("⏱", "5h", live);
  // フォールバック: cache。古すぎる値は freshFromCache が捨てる。
  const r = await readClaudeRateLimits();
  if (!r) return "";
  return renderWindow("⏱", "5h", freshFromCache(r.fiveHour, r.fetchedAt, FIVE_HOUR_MS));
};

export const sevenDaySegment = async (input: StatuslineInput | null): Promise<string> => {
  const live = fromStdinWindow(input?.rate_limits?.seven_day);
  if (live) return renderWindow("📅", "7d", live);
  const r = await readClaudeRateLimits();
  if (!r) return "";
  return renderWindow("📅", "7d", freshFromCache(r.sevenDay, r.fetchedAt, SEVEN_DAY_MS));
};

// Opus/Sonnet 別の 7d は stdin rate_limits に無い（five_hour / seven_day のみ）。
// cache フォールバックのみ・7d 鮮度でガードする。
export const sevenDayOpusSegment = async (): Promise<string> => {
  const r = await readClaudeRateLimits();
  if (!r) return "";
  return renderWindow("🅾", "7d Opus", freshFromCache(r.sevenDayOpus, r.fetchedAt, SEVEN_DAY_MS));
};

export const sevenDaySonnetSegment = async (): Promise<string> => {
  const r = await readClaudeRateLimits();
  if (!r) return "";
  return renderWindow("🅢", "7d Sonnet", freshFromCache(r.sevenDaySonnet, r.fetchedAt, SEVEN_DAY_MS));
};

export const branchSegment = async (input: StatuslineInput | null): Promise<string> => {
  const cwd = inputCwd(input);
  const [b, slug] = await Promise.all([gitBranch(cwd), gitRepoSlug(cwd)]);
  if (!b) return "";
  const label = slug ? `${c.green(slug)} ${muted(`(${b})`)}` : c.green(b);
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
  parts.push(`${c.bold(c.yellow(String(totalFiles)))}${muted(" files")}`);
  if (stat.insertions > 0) parts.push(c.bold(c.green(`+${stat.insertions}`)));
  if (stat.deletions > 0) parts.push(c.bold(c.red(`-${stat.deletions}`)));
  if (untracked > 0) parts.push(muted(`(${untracked} new)`));
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
  return `${c.magenta("♊")} ${muted("Gemini")} ${c.bold(c.magenta("24h"))} ${day1} ${muted("·")} ${c.bold(c.magenta("7d"))} ${day7}`;
};

// gitstats と gitsummary を「：」で結合した複合セグメント。デフォルト推奨。
export const gitSegment = async (input: StatuslineInput | null): Promise<string> => {
  const [stats, summary] = await Promise.all([
    gitstatsSegment(input),
    gitsummarySegment(input),
  ]);
  if (!stats) return summary;
  if (!summary) return stats;
  return `${stats} ${muted("：")} ${summary}`;
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
      return fiveHourSegment(input);
    case "7d":
      return sevenDaySegment(input);
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
