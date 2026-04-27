// CLI の長フラグ・positional 引数を分解する小さなパーサ。
// 既知の値フラグは次トークンを必ず value として消費し、それ以外の長フラグは
// boolean。`--flag=value` 形式、boolean 後の positional に強い。

export type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

export const VALUE_FLAGS: ReadonlySet<string> = new Set([
  "days",
  "limit",
  "segments",
  "format",
]);

export const parseArgs = (argv: string[]): ParsedArgs => {
  const out: ParsedArgs = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 2) {
        const key = a.slice(2, eq);
        out.flags[key] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      if (VALUE_FLAGS.has(key)) {
        const next = argv[i + 1];
        if (next !== undefined) {
          out.flags[key] = next;
          i++;
        } else {
          out.flags[key] = true;
        }
      } else {
        out.flags[key] = true;
      }
    } else if (a === "-h") {
      out.flags.help = true;
    } else {
      out.positional.push(a);
    }
  }
  return out;
};

// 厳密に正の整数のみ受理（小数・負数・NaN・空文字・boolean は fallback）。
export const num = (v: string | boolean | undefined, fallback: number): number => {
  if (typeof v !== "string") return fallback;
  if (!/^\d+$/.test(v)) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
