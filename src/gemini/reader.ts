import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { emptyTokens, type UsageEntry } from "../types.ts";
import { geminiCost } from "./pricing.ts";

const TMP_DIR = join(homedir(), ".gemini", "tmp");

type ChatFile = {
  sessionId?: string;
  messages?: Array<{
    id?: string;
    timestamp?: string;
    type?: string;
    model?: string;
    tokens?: {
      input?: number;
      output?: number;
      cached?: number;
      thoughts?: number;
      tool?: number;
      total?: number;
    };
  }>;
};

async function* walkChats(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkChats(p);
    else if (e.isFile() && e.name.startsWith("session-") && e.name.endsWith(".json")) yield p;
  }
}

export type LoadOptions = {
  since?: Date;
  until?: Date;
};

/**
 * Gemini CLI のチャット履歴 (~/.gemini/tmp/<projectHash>/chats/session-*.json)
 * を走査し、type=gemini メッセージの tokens を usage entry として返す。
 * messageId が無い場合は session+timestamp で重複排除する。
 */
export async function loadGeminiUsage(opts: LoadOptions = {}): Promise<UsageEntry[]> {
  const seen = new Set<string>();
  const out: UsageEntry[] = [];

  for await (const file of walkChats(TMP_DIR)) {
    let text: string;
    try {
      text = await Bun.file(file).text();
    } catch {
      continue;
    }
    let chat: ChatFile;
    try {
      chat = JSON.parse(text) as ChatFile;
    } catch {
      continue;
    }
    const sessionId = chat.sessionId ?? file;
    for (const m of chat.messages ?? []) {
      if (m.type !== "gemini") continue;
      const t = m.tokens;
      if (!t) continue;
      const ts = m.timestamp ? new Date(m.timestamp) : null;
      if (!ts || isNaN(ts.getTime())) continue;
      if (opts.since && ts < opts.since) continue;
      if (opts.until && ts >= opts.until) continue;

      const key = `${sessionId}::${m.id ?? ts.toISOString()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const tokens = {
        ...emptyTokens(),
        input: t.input ?? 0,
        cacheRead: t.cached ?? 0,
        output: (t.output ?? 0) + (t.tool ?? 0),
        reasoning: t.thoughts ?? 0,
      };
      const model = m.model ?? "gemini-unknown";
      out.push({
        provider: "gemini",
        timestamp: ts,
        model,
        sessionId,
        tokens,
        costUsd: geminiCost(model, tokens),
      });
    }
  }
  return out;
}
