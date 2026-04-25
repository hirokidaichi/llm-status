import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { emptyTokens, type UsageEntry } from "../types.ts";
import { claudeCost } from "./pricing.ts";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

type RawLine = {
  type?: string;
  sessionId?: string;
  requestId?: string;
  timestamp?: string;
  message?: {
    id?: string;
    model?: string;
    role?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
};

async function* walkJsonl(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkJsonl(p);
    else if (e.isFile() && e.name.endsWith(".jsonl")) yield p;
  }
}

export type LoadOptions = {
  since?: Date;
  until?: Date;
};

/**
 * Claude Code の JSONL ログを走査して usage 行を抽出。
 * message.id + requestId のペアで重複排除（同じレスポンスが
 * 複数 session ファイルに resume で出てくるため）。
 */
export async function loadClaudeUsage(opts: LoadOptions = {}): Promise<UsageEntry[]> {
  const seen = new Set<string>();
  const out: UsageEntry[] = [];

  for await (const file of walkJsonl(PROJECTS_DIR)) {
    let text: string;
    try {
      text = await Bun.file(file).text();
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line || line[0] !== "{") continue;
      let row: RawLine;
      try {
        row = JSON.parse(line) as RawLine;
      } catch {
        continue;
      }
      if (row.type !== "assistant") continue;
      const u = row.message?.usage;
      if (!u) continue;
      const ts = row.timestamp ? new Date(row.timestamp) : null;
      if (!ts || isNaN(ts.getTime())) continue;
      if (opts.since && ts < opts.since) continue;
      if (opts.until && ts >= opts.until) continue;

      const dedupeKey = `${row.message?.id ?? ""}::${row.requestId ?? ""}`;
      if (dedupeKey !== "::" && seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const tokens = {
        ...emptyTokens(),
        input: u.input_tokens ?? 0,
        output: u.output_tokens ?? 0,
        cacheCreation: u.cache_creation_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
      };
      const model = row.message?.model ?? "unknown";
      out.push({
        provider: "claude",
        timestamp: ts,
        model,
        sessionId: row.sessionId ?? "unknown",
        requestId: row.requestId,
        tokens,
        costUsd: claudeCost(model, tokens),
      });
    }
  }
  return out;
}
