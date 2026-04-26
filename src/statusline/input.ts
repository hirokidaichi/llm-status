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
