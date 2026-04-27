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

const DEFAULT_RPC_TIMEOUT_MS = 12_000;

export type ReadOptions = { timeoutMs?: number };

export async function readCodexRateLimits(opts: ReadOptions = {}): Promise<RateLimitsResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
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
  // stderr が大量に出るとパイプが詰まり stdout 側もブロックされる（OS パイプ
   // バッファ満杯）。ここで非同期に drain して捨てる。エラーは無視。
  const stderrDrain = (async () => {
    try {
      const r = proc.stderr.getReader();
      try {
        while (true) {
          const { done } = await r.read();
          if (done) break;
        }
      } finally {
        try { r.releaseLock(); } catch {}
      }
    } catch {}
  })();
  // unhandled rejection 防止
  stderrDrain.catch(() => {});

  const deadline = Date.now() + timeoutMs;

  send(1, "initialize", { clientInfo: { name: "llm-status", version: "0.1.0" } });

  // タイマー敗北時の pending read がそのまま orphan になると Bun が
   // AbortError を unhandled rejection として扱うことがあるので、最後に
   // 抑制するためにここで保持しておく。
  let pendingRead: ReturnType<typeof reader.read> | null = null;

  try {
    while (Date.now() < deadline && result === null) {
      const remaining = deadline - Date.now();
      pendingRead = reader.read();
      let timerHandle: ReturnType<typeof setTimeout> | null = null;
      const timer = new Promise<{ done: true; value?: undefined }>((resolve) => {
        timerHandle = setTimeout(() => resolve({ done: true }), remaining);
        timerHandle.unref?.();
      });
      const r = await Promise.race([pendingRead, timer]);
      if (timerHandle) clearTimeout(timerHandle);
      if (r.done) break;
      pendingRead = null;
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
            const r2 = msg.result as Partial<RateLimitsResult>;
            // 形状を最低限検証してから採用（rateLimits は必須、
             // rateLimitsByLimitId は無いこともあるので空オブジェクトで補う）。
            if (r2.rateLimits && typeof r2.rateLimits === "object") {
              result = {
                rateLimits: r2.rateLimits,
                rateLimitsByLimitId: r2.rateLimitsByLimitId ?? {},
              };
              break;
            }
          }
        } catch {
          // 無視（JSON 以外の行）
        }
      }
    }
  } finally {
    // pending read を tryCancel で抑制し、その後 reader を release する。
     // ここで catch を付けないと Bun が unhandled rejection を出す。
    if (pendingRead) pendingRead.catch(() => {});
    try {
      await reader.cancel().catch(() => {});
    } catch {}
    try {
      reader.releaseLock();
    } catch {}
    try {
      proc.kill();
    } catch {}
    // 子プロセスが kill を無視する場合に備えて exited を 1s で打ち切る。
    await Promise.race([
      proc.exited.catch(() => {}),
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 1000);
        t.unref?.();
      }),
    ]);
    await stderrDrain;
  }

  if (!result) throw new Error("codex app-server did not return rateLimits within timeout");
  return result;
}
