import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { emptyTokens, type UsageEntry } from "../types.ts";
import { codexCost } from "./pricing.ts";

const SESSIONS_DIR = join(homedir(), ".codex", "sessions");

type TokenInfo = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
};

type RawLine = {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    id?: string;
    model?: string;
    info?: {
      total_token_usage?: TokenInfo;
      last_token_usage?: TokenInfo;
      model_context_window?: number;
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

type SessionState = {
  sessionId: string;
  model: string;
  firstTs: Date;
  lastTs: Date;
  total: TokenInfo;
};

/**
 * Codex の rollout JSONL を走査。token_count イベントは累積値なので、
 * 各セッションごとに最後の total_token_usage を採用する。
 * --since 指定時はその時刻以降に lastTs があるセッションのみ。
 */
export async function loadCodexUsage(opts: LoadOptions = {}): Promise<UsageEntry[]> {
  const sessions = new Map<string, SessionState>();

  for await (const file of walkJsonl(SESSIONS_DIR)) {
    // ファイル名から session id 推定 (rollout-...-<uuid>.jsonl)
    const m = file.match(/rollout-[\d-]+T[\d-]+-([0-9a-f-]+)\.jsonl$/i);
    const sid = m?.[1] ?? file;

    let text: string;
    try {
      text = await Bun.file(file).text();
    } catch {
      continue;
    }

    let model = "unknown";
    let firstTs: Date | null = null;
    let lastTs: Date | null = null;
    let lastTotal: TokenInfo | null = null;

    for (const line of text.split("\n")) {
      if (!line || line[0] !== "{") continue;
      let row: RawLine;
      try {
        row = JSON.parse(line) as RawLine;
      } catch {
        continue;
      }
      const ts = row.timestamp ? new Date(row.timestamp) : null;
      if (ts && !isNaN(ts.getTime())) {
        if (!firstTs) firstTs = ts;
        lastTs = ts;
      }
      if (row.type === "session_meta" && row.payload?.model) model = row.payload.model;
      if (row.type === "turn_context" && row.payload?.model) model = row.payload.model;
      if (row.type === "event_msg" && row.payload?.type === "token_count") {
        const info = row.payload.info?.total_token_usage;
        if (info) lastTotal = info;
      }
    }

    if (!lastTotal || !firstTs || !lastTs) continue;
    if (opts.since && lastTs < opts.since) continue;
    if (opts.until && firstTs >= opts.until) continue;

    sessions.set(sid, { sessionId: sid, model, firstTs, lastTs, total: lastTotal });
  }

  const out: UsageEntry[] = [];
  for (const s of sessions.values()) {
    const tokens = {
      ...emptyTokens(),
      input: s.total.input_tokens ?? 0,
      cacheRead: s.total.cached_input_tokens ?? 0,
      output: s.total.output_tokens ?? 0,
      reasoning: s.total.reasoning_output_tokens ?? 0,
    };
    out.push({
      provider: "codex",
      timestamp: s.lastTs,
      model: s.model,
      sessionId: s.sessionId,
      tokens,
      costUsd: codexCost(s.model, tokens),
    });
  }
  return out;
}
