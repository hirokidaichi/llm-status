import { loadClaudeUsage } from "../claude/reader.ts";
import { loadCodexUsage } from "../codex/reader.ts";
import { totalTokens } from "../types.ts";
import { c, fmtCost, fmtNum } from "../format/colors.ts";
import { renderTable } from "../format/table.ts";
import { groupDaily, startOfDaysAgo } from "./aggregate.ts";

export const runDaily = async (days = 7): Promise<void> => {
  const since = startOfDaysAgo(days - 1);
  const [claude, codex] = await Promise.all([
    loadClaudeUsage({ since }),
    loadCodexUsage({ since }),
  ]);
  const buckets = groupDaily([...claude, ...codex]);

  console.log(c.bold(`Daily usage (last ${days} days)`));
  console.log("");

  const cols = [
    { header: c.dim("Date") },
    { header: c.dim("Provider") },
    { header: c.dim("N"), align: "right" as const },
    { header: c.dim("Input"), align: "right" as const },
    { header: c.dim("Cache W"), align: "right" as const },
    { header: c.dim("Cache R"), align: "right" as const },
    { header: c.dim("Output"), align: "right" as const },
    { header: c.dim("Reason"), align: "right" as const },
    { header: c.dim("Total"), align: "right" as const },
    { header: c.dim("Est. $"), align: "right" as const },
  ];

  const rows = buckets.map((b) => [
    b.date,
    b.provider === "claude" ? c.cyan("Claude") : c.magenta("Codex"),
    fmtNum(b.entries),
    fmtNum(b.tokens.input),
    fmtNum(b.tokens.cacheCreation),
    fmtNum(b.tokens.cacheRead),
    fmtNum(b.tokens.output),
    fmtNum(b.tokens.reasoning),
    c.bold(fmtNum(totalTokens(b.tokens))),
    b.costUsd === 0 ? c.dim("—") : fmtCost(b.costUsd),
  ]);

  if (rows.length === 0) console.log(c.dim("No usage in window."));
  else console.log(renderTable(cols, rows));
};
