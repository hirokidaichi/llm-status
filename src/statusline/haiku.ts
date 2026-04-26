// git status を Haiku に渡して 1 行サマリーを生成する。
// - キャッシュ: cwd + status のハッシュをキーに ~/.cache/llm-status/git-summaries/<hash>.txt
// - キャッシュHit: ファイル読みのみ（<10ms）
// - キャッシュMiss: ANTHROPIC_API_KEY があれば Haiku を 2.5s で叩く。失敗・無キー時は機械的サマリー
// - 機械的サマリー: `3M 2A 1?` のような git porcelain ベースの集計
//
// ネットワークアクセスを無効化したい場合は LLM_STATUS_NO_HAIKU=1 を設定する。

import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { gitStatus, gitDiffStat } from "./git.ts";

const CACHE_DIR = join(homedir(), ".cache", "llm-status", "git-summaries");
const HAIKU_TIMEOUT_MS = 2_500;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// プロンプトを変えたら PROMPT_VERSION を更新してキャッシュを自動失効させる。
const PROMPT_VERSION = "v2-ja";
const PROMPT = `git の作業ツリーの状態を、何の作業をしているか **日本語で** 1 行に要約せよ。

ルール:
- 出力は要約フレーズのみ。引用符・句読点・前置きは付けない。
- **全角 14 文字以内** を厳守。
- 内容で要約する。例:「ステータスライン色付け」「認証フロー実装中」「不要モジュール削除」「ドキュメント追記」「テスト追加」。
- 「〜の修正」「〜の変更」のような冗長語は避け、対象＋動作だけ書く。
- カタカナ・漢字・ひらがな自由、英数字も可。`;

// 全角を 2 として数えるおおよその表示幅。半角英数記号は 1。
const displayWidth = (s: string): number => {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    w += code > 0x7f ? 2 : 1;
  }
  return w;
};

const MAX_DISPLAY_WIDTH = 28; // 全角 14 文字相当

const truncateByWidth = (s: string, max: number): string => {
  let w = 0;
  let out = "";
  for (const ch of s) {
    const cw = (ch.codePointAt(0) ?? 0) > 0x7f ? 2 : 1;
    if (w + cw > max) break;
    out += ch;
    w += cw;
  }
  return out;
};


export const mechanicalSummary = (status: string): string => {
  const lines = status.split("\n").filter(Boolean);
  let m = 0;
  let a = 0;
  let d = 0;
  let r = 0;
  let u = 0;
  for (const line of lines) {
    const code = line.slice(0, 2);
    if (code === "??") u++;
    else if (code.includes("D")) d++;
    else if (code.includes("R")) r++;
    else if (code.includes("A")) a++;
    else if (code.includes("M")) m++;
  }
  const parts: string[] = [];
  if (m) parts.push(`${m}M`);
  if (a) parts.push(`${a}A`);
  if (d) parts.push(`${d}D`);
  if (r) parts.push(`${r}R`);
  if (u) parts.push(`${u}?`);
  return parts.join(" ") || "clean";
};

const cacheKey = (cwd: string, status: string): string =>
  createHash("sha256")
    .update(PROMPT_VERSION + "\n" + cwd + "\n" + status)
    .digest("hex")
    .slice(0, 16);

const readCache = async (key: string): Promise<string | null> => {
  try {
    const text = await Bun.file(join(CACHE_DIR, `${key}.txt`)).text();
    const trimmed = text.trim();
    return trimmed || null;
  } catch {
    return null;
  }
};

const writeCache = async (key: string, value: string): Promise<void> => {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await Bun.write(join(CACHE_DIR, `${key}.txt`), value);
  } catch {
    // best-effort
  }
};

const callHaiku = async (status: string, diffStat: string | null): Promise<string | null> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (process.env.LLM_STATUS_NO_HAIKU === "1") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);
  try {
    const userContent = [
      "git status --porcelain:",
      "```",
      status.slice(0, 4000),
      "```",
      diffStat ? `\ngit diff --stat HEAD:\n\`\`\`\n${diffStat.slice(0, 2000)}\n\`\`\`` : "",
    ].join("\n");

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 80,
        system: PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = json.content?.find((b) => b.type === "text")?.text?.trim();
    if (!text) return null;
    return displayWidth(text) > MAX_DISPLAY_WIDTH ? truncateByWidth(text, MAX_DISPLAY_WIDTH) : text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const haikuGitSummary = async (cwd: string): Promise<string | null> => {
  const status = await gitStatus(cwd);
  if (status == null) return null; // not a git repo
  if (!status.trim()) return null; // clean tree → segment は空に

  const key = cacheKey(cwd, status);
  const cached = await readCache(key);
  if (cached) return cached;

  const diffStat = await gitDiffStat(cwd);
  const haiku = await callHaiku(status, diffStat);
  const summary = haiku ?? mechanicalSummary(status);

  // Haiku 結果はキャッシュ。機械的フォールバックは次回 Haiku を試させたいのでキャッシュしない
  if (haiku) await writeCache(key, haiku);

  return summary;
};
