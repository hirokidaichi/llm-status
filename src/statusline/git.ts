// statusline 用の git ヘルパー。失敗は全て null を返し、statusline が
// 落ちないようにする。`git -C cwd ...` で対象ディレクトリを明示。
// network filesystem や hung git に備え、必ずタイムアウトを掛ける。

const RUN_GIT_TIMEOUT_MS = 1500;

const runGit = async (cwd: string, args: string[]): Promise<string | null> => {
  type Proc = ReturnType<
    typeof Bun.spawn<"ignore", "pipe", "pipe">
  >;
  let proc: Proc | null = null;
  try {
    proc = Bun.spawn(["git", "-C", cwd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    // stderr を drain してパイプ詰まりを防ぐ（git は警告を stderr に
     // 大量出力することがある: ホスト鍵警告、unsigned commits など）。
    const stderrDrain = new Response(proc.stderr).text().catch(() => "");

    const stdoutPromise = new Response(proc.stdout).text();
    const timer = new Promise<null>((resolve) => {
      const t = setTimeout(() => resolve(null), RUN_GIT_TIMEOUT_MS);
      t.unref?.();
    });
    const text = await Promise.race([stdoutPromise, timer]);
    if (text === null) {
      // タイムアウト。子プロセスを kill して exit を待つ（こちらも 500ms 制限）。
      try { proc.kill(); } catch {}
      await Promise.race([
        proc.exited.catch(() => {}),
        new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 500);
          t.unref?.();
        }),
      ]);
      stdoutPromise.catch(() => {});
      stderrDrain.catch(() => {});
      return null;
    }
    await proc.exited;
    await stderrDrain;
    if (proc.exitCode !== 0) return null;
    return text;
  } catch {
    if (proc) {
      try { proc.kill(); } catch {}
    }
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

/**
 * `git remote get-url origin` を `owner/repo` の slug に正規化。
 * SSH (`git@github.com:owner/repo.git`) / HTTPS (`https://github.com/owner/repo[.git]`)
 * の両形式に対応。GitHub 以外のホストや remote 未設定なら null。
 */
export const parseRepoSlug = (url: string): string | null => {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const m = trimmed.match(
    /^(?:git@github\.com:|https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/)([^\/]+\/[^\/]+?)(?:\.git)?\/?$/,
  );
  return m?.[1] ?? null;
};

export const gitRepoSlug = async (cwd: string): Promise<string | null> => {
  const out = await runGit(cwd, ["remote", "get-url", "origin"]);
  if (out == null) return null;
  return parseRepoSlug(out);
};

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
