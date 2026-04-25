// codex app-server (JSON-RPC over stdio) ラッパー。
// 改行区切り JSON-RPC で initialize → account/rateLimits/read を発行する。

export type RateWindow = {
  usedPercent: number;
  windowDurationMins: number;
  resetsAt: number; // unix epoch seconds
};

export type RateBlock = {
  limitId: string;
  limitName: string | null;
  primary: RateWindow | null;
  secondary: RateWindow | null;
  planType: string | null;
  rateLimitReachedType: string | null;
  credits: { hasCredits?: boolean; unlimited?: boolean; balance?: string } | null;
};

export type RateLimitsResult = {
  rateLimits: RateBlock;
  rateLimitsByLimitId: Record<string, RateBlock>;
};

const RPC_TIMEOUT_MS = 12_000;

export async function readCodexRateLimits(): Promise<RateLimitsResult> {
  const proc = Bun.spawn(["codex", "app-server"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const send = (id: number, method: string, params: unknown): void => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    proc.stdin.write(payload);
    proc.stdin.flush?.();
  };

  let initialized = false;
  let result: RateLimitsResult | null = null;

  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const deadline = Date.now() + RPC_TIMEOUT_MS;

  send(1, "initialize", { clientInfo: { name: "llm-status", version: "0.1.0" } });

  try {
    while (Date.now() < deadline && result === null) {
      const remaining = deadline - Date.now();
      const readPromise = reader.read();
      let timerHandle: ReturnType<typeof setTimeout> | null = null;
      const timer = new Promise<{ done: true; value?: undefined }>((resolve) => {
        timerHandle = setTimeout(() => resolve({ done: true }), remaining);
        timerHandle.unref?.();
      });
      const r = await Promise.race([readPromise, timer]);
      if (timerHandle) clearTimeout(timerHandle);
      if (r.done) break;
      buf += decoder.decode(r.value, { stream: true });

      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as { id?: number; result?: unknown };
          if (msg.id === 1 && !initialized) {
            initialized = true;
            send(2, "account/rateLimits/read", {});
          } else if (msg.id === 2 && msg.result) {
            const r2 = msg.result as RateLimitsResult;
            if (r2.rateLimits) {
              result = r2;
              break;
            }
          }
        } catch {
          // 無視（JSON 以外の行）
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
    try {
      proc.kill();
    } catch {}
    try {
      await proc.exited;
    } catch {}
  }

  if (!result) throw new Error("codex app-server did not return rateLimits within timeout");
  return result;
}
