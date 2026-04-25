import { loadClaudeUsage } from "../claude/reader.ts";
import { loadCodexUsage } from "../codex/reader.ts";
import { loadGeminiUsage } from "../gemini/reader.ts";
import { totalTokens } from "../types.ts";
import { c, fmtCost, fmtNum } from "../format/colors.ts";
import { renderTable } from "../format/table.ts";
import { groupSession, startOfDaysAgo } from "./aggregate.ts";

export const runSession = async (limit = 20, days = 7): Promise<void> => {
  const since = startOfDaysAgo(days - 1);
  const [claude, codex, gemini] = await Promise.all([
    loadClaudeUsage({ since }),
    loadCodexUsage({ since }),
    loadGeminiUsage({ since }),
  ]);
  const buckets = groupSession([...claude, ...codex, ...gemini]).slice(0, limit);

  console.log(c.bold(`Recent ${buckets.length} sessions (within ${days}d)`));
  console.log("");

  const cols = [
    { header: c.dim("Last") },
    { header: c.dim("Provider") },
    { header: c.dim("Session") },
    { header: c.dim("N"), align: "right" as const },
    { header: c.dim("Total"), align: "right" as const },
    { header: c.dim("Est. $"), align: "right" as const },
    { header: c.dim("Models") },
  ];

  const providerLabel = (p: string): string =>
    p === "claude" ? c.cyan("Claude") : p === "codex" ? c.magenta("Codex") : c.blue("Gemini");

  const rows = buckets.map((b) => [
    b.lastTs.toISOString().replace("T", " ").slice(0, 16),
    providerLabel(b.provider),
    b.sessionId.slice(0, 8),
    fmtNum(b.entries),
    c.bold(fmtNum(totalTokens(b.tokens))),
    b.costUsd === 0 ? c.dim("—") : fmtCost(b.costUsd),
    [...b.models].join(", "),
  ]);
  if (rows.length === 0) console.log(c.dim("No sessions in window."));
  else console.log(renderTable(cols, rows));
};
