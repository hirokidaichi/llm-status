import { runDefault } from "./cli/default.ts";
import { runDaily } from "./cli/daily.ts";
import { runSession } from "./cli/session.ts";
import { runLimits } from "./cli/limits.ts";
import { runJson } from "./cli/json.ts";
import { parseSegments, runStatusline } from "./cli/statusline.ts";
import type { CodexFormat } from "./statusline/codex.ts";

const HELP = `llm-status — Claude Code & OpenAI Codex usage on one screen

USAGE:
  llm-status                       Today's Claude + Codex summary
  llm-status daily [--days N]      Daily breakdown (default 7 days)
  llm-status session [--limit N] [--days N]
                                   Recent sessions
  llm-status limits                Codex rate limits (5h / weekly window)
  llm-status statusline [--segments LIST] [--format F]
                                   One-line statusline (Claude Code stdin JSON aware)
  llm-status --json [today|daily|session] [--days N]
                                   Machine-readable output

OPTIONS:
  --days N        Look back N days (default 7)
  --limit N       Cap rows for session view (default 20)
  --segments L    Comma-separated tokens. Use 'nl' to break to a new line. Tokens:
                  model, 5h, 7d, 7d_opus, 7d_sonnet, branch, codex,
                  gitstats, gitsummary, nl
                  (default: model,5h,7d,branch,codex,nl,gitstats,gitsummary)
  --format F      Codex segment format: minimal | compact (default) | full
  --json          Print JSON instead of a table
  -h, --help      Show this help
`;

type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

const parseArgs = (argv: string[]): ParsedArgs => {
  const out: ParsedArgs = { positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        out.flags[key] = next;
        i++;
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

const num = (v: string | boolean | undefined, fallback: number): number => {
  if (typeof v !== "string") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.help) {
    console.log(HELP);
    return;
  }
  const cmd = args.positional[0];
  const json = Boolean(args.flags.json);
  const days = num(args.flags.days, 7);
  const limit = num(args.flags.limit, 20);

  if (json) {
    if (cmd === "limits") {
      await runLimits(true);
      return;
    }
    const mode = cmd ?? "today";
    if (mode !== "today" && mode !== "daily" && mode !== "session") {
      console.error(`unknown json mode: ${mode}`);
      process.exit(2);
    }
    await runJson(mode, days);
    return;
  }

  switch (cmd) {
    case undefined:
    case "today":
      await runDefault();
      return;
    case "daily":
      await runDaily(days);
      return;
    case "session":
    case "sessions":
      await runSession(limit, days);
      return;
    case "limits":
      await runLimits(false);
      return;
    case "statusline": {
      const fmtRaw = args.flags.format;
      const codexFormat: CodexFormat =
        fmtRaw === "minimal" || fmtRaw === "compact" || fmtRaw === "full" ? fmtRaw : "compact";
      const segRaw = typeof args.flags.segments === "string" ? args.flags.segments : undefined;
      await runStatusline(parseSegments(segRaw), codexFormat);
      return;
    }
    case "help":
      console.log(HELP);
      return;
    default:
      console.error(`unknown command: ${cmd}`);
      console.error(HELP);
      process.exit(2);
  }
};

await main();
