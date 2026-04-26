// transcript_path (Claude Code の session JSONL) の末尾だけ読んで、
// 直近の assistant message の usage から context 使用量を割り出す。
// 全文読みは長セッションで遅いので Bun.file().slice() で末尾 256KB を取る。

const TAIL_BYTES = 256 * 1024;

const MODEL_CONTEXT: Array<{ match: RegExp; ctx: number }> = [
  { match: /opus-4-7|sonnet-4-6/i, ctx: 1_000_000 },
  { match: /opus|sonnet|haiku/i, ctx: 200_000 },
];

const ctxForModel = (model: string): number => {
  for (const m of MODEL_CONTEXT) if (m.match.test(model)) return m.ctx;
  return 200_000;
};

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type Row = {
  type?: string;
  message?: { model?: string; usage?: Usage };
};

export type ContextSize = { used: number; max: number; model: string };

export const readContextSize = async (path: string): Promise<ContextSize | null> => {
  let text: string;
  try {
    const file = Bun.file(path);
    const size = file.size;
    if (size === 0) return null;
    const start = Math.max(0, size - TAIL_BYTES);
    text = await file.slice(start, size).text();
  } catch {
    return null;
  }

  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || line[0] !== "{") continue;
    let row: Row;
    try {
      row = JSON.parse(line) as Row;
    } catch {
      continue;
    }
    if (row.type !== "assistant") continue;
    const u = row.message?.usage;
    if (!u) continue;
    const used =
      (u.input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0);
    const model = row.message?.model ?? "unknown";
    return { used, max: ctxForModel(model), model };
  }
  return null;
};
