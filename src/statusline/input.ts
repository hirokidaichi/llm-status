// Claude Code が statusline コマンドの stdin に流す JSON を読む。
// 仕様: https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/statusline
// TTY のとき（手動実行）は読まずに null を返す。

export type StatuslineInput = {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  model?: { id?: string; display_name?: string };
  workspace?: { current_dir?: string; project_dir?: string };
  cost?: {
    total_cost_usd?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
    total_duration_ms?: number;
    total_api_duration_ms?: number;
  };
  // Claude Code が API レスポンスから算出して渡す context window 情報。
  // used_percentage は input-only (input + cache_creation + cache_read) で
  // 事前計算済み。context_window_size は 1M モデルだと 1_000_000。
  // 古い CC や session 序盤では欠落 / null になりうる（doc 参照）。
  context_window?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    context_window_size?: number;
    used_percentage?: number | null;
    remaining_percentage?: number | null;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
  // Claude.ai (Pro/Max) 加入者のみ、session 初回 API レスポンス後に出現。
  // resets_at は **Unix epoch 秒**（.ratelimit_cache.json の ISO 文字列とは別形式）。
  // 各 window は独立して欠落しうる。
  rate_limits?: {
    five_hour?: { used_percentage?: number; resets_at?: number } | null;
    seven_day?: { used_percentage?: number; resets_at?: number } | null;
  };
  exceeds_200k_tokens?: boolean;
  output_style?: { name?: string };
  version?: string;
};

export const readInput = async (): Promise<StatuslineInput | null> => {
  if (process.stdin.isTTY) return null;
  try {
    const text = await Bun.stdin.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as StatuslineInput;
  } catch {
    return null;
  }
};

export const inputCwd = (input: StatuslineInput | null): string =>
  input?.cwd ?? input?.workspace?.current_dir ?? process.cwd();
