// statusline 用の git ヘルパー。失敗は全て null を返し、statusline が
// 落ちないようにする。`git -C cwd ...` で対象ディレクトリを明示。

const runGit = async (cwd: string, args: string[]): Promise<string | null> => {
  try {
    const proc = Bun.spawn(["git", "-C", cwd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    if (proc.exitCode !== 0) return null;
    return text;
  } catch {
    return null;
  }
};

export const gitBranch = async (cwd: string): Promise<string | null> => {
  const out = await runGit(cwd, ["symbolic-ref", "--short", "HEAD"]);
  if (out == null) {
    // detached HEAD の場合は短縮 SHA を返す
    const sha = await runGit(cwd, ["rev-parse", "--short", "HEAD"]);
    return sha?.trim() || null;
  }
  return out.trim() || null;
};

export const gitStatus = async (cwd: string): Promise<string | null> =>
  runGit(cwd, ["status", "--porcelain"]);

export const gitDiffStat = async (cwd: string): Promise<string | null> =>
  runGit(cwd, ["diff", "--stat", "HEAD"]);

export type DiffShortstat = { files: number; insertions: number; deletions: number };

/**
 * `git diff --shortstat HEAD` を解析。コミット済との差分（staged + unstaged）。
 * untracked は含まれないので、呼び出し側で porcelain と組み合わせて補う。
 */
export const gitDiffShortstat = async (cwd: string): Promise<DiffShortstat | null> => {
  const out = await runGit(cwd, ["diff", "--shortstat", "HEAD"]);
  if (out == null) return null;
  const trimmed = out.trim();
  if (!trimmed) return { files: 0, insertions: 0, deletions: 0 };
  const m = trimmed.match(
    /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/,
  );
  if (!m) return null;
  return {
    files: Number.parseInt(m[1] ?? "0", 10),
    insertions: Number.parseInt(m[2] ?? "0", 10),
    deletions: Number.parseInt(m[3] ?? "0", 10),
  };
};

export const countUntracked = (porcelain: string): number => {
  let n = 0;
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("??")) n++;
  }
  return n;
};
