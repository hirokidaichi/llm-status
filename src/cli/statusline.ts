// Claude Code の statusline として登録する想定の 1〜複数行レンダラ。
// `nl` という特殊トークンを segment 列に挟むと、そこで改行する。
// 各セグメントは並列に評価され、空文字を返したものは出力から除外される。

import { c } from "../format/colors.ts";
import { readInput } from "../statusline/input.ts";
import { renderSegment, type SegmentName } from "../statusline/segments.ts";
import type { CodexFormat } from "../statusline/codex.ts";

export type SegmentToken = SegmentName | "nl";

const DEFAULT_SEGMENTS: SegmentToken[] = [
  // 1 行目: Claude Code
  "model",
  "ctx",
  "5h",
  "7d",
  "nl",
  // 2 行目: git
  "branch",
  "git",
  "nl",
  // 3 行目: 他モデル
  "codex",
  "gemini",
];

const VALID_TOKENS: ReadonlySet<SegmentToken> = new Set<SegmentToken>([
  "model",
  "ctx",
  "5h",
  "7d",
  "7d_opus",
  "7d_sonnet",
  "branch",
  "codex",
  "gemini",
  "gitstats",
  "gitsummary",
  "git",
  "nl",
]);

const isToken = (s: string): s is SegmentToken =>
  (VALID_TOKENS as ReadonlySet<string>).has(s);

export const parseSegments = (raw: string | undefined): SegmentToken[] => {
  if (!raw) return DEFAULT_SEGMENTS;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = parts.filter(isToken);
  return valid.length > 0 ? valid : DEFAULT_SEGMENTS;
};

export const runStatusline = async (
  segments: SegmentToken[],
  codexFormat: CodexFormat,
): Promise<void> => {
  const input = await readInput();
  // 各 segment が throw しても statusline 全体を絶対に落とさないため、
   // ここで最後の防衛線を張る（CLAUDE.md: statusline must never throw）。
   // 個別 segment 内でも error swallow しているが、cache 破損時の型エラー等
   // 想定外の throw を吸収するための保険。
  const rendered = await Promise.all(
    segments.map(async (token) => {
      if (token === "nl") return "\n";
      try {
        return await renderSegment(token, input, codexFormat);
      } catch {
        return "";
      }
    }),
  );

  const lines: string[][] = [[]];
  for (const out of rendered) {
    if (out === "\n") {
      lines.push([]);
    } else if (out.length > 0) {
      const last = lines[lines.length - 1];
      if (last) last.push(out);
    }
  }

  const sep = c.dim(" · ");
  const text = lines
    .filter((l) => l.length > 0)
    .map((l) => l.join(sep))
    .join("\n");
  process.stdout.write(text + "\n");
};
