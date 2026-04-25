import { readCodexRateLimits, type RateBlock } from "../codex/app-server.ts";
import { c, fmtPct, fmtRelative } from "../format/colors.ts";
import { renderTable } from "../format/table.ts";

const fmtWindow = (mins: number): string => {
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (60 * 24))}d`;
};

const blockRows = (b: RateBlock): string[][] => {
  const rows: string[][] = [];
  if (b.primary) {
    rows.push([
      b.limitName ?? b.limitId,
      `${fmtWindow(b.primary.windowDurationMins)} window`,
      fmtPct(b.primary.usedPercent),
      fmtRelative(b.primary.resetsAt * 1000),
      b.planType ?? "",
    ]);
  }
  if (b.secondary) {
    rows.push([
      "",
      `${fmtWindow(b.secondary.windowDurationMins)} window`,
      fmtPct(b.secondary.usedPercent),
      fmtRelative(b.secondary.resetsAt * 1000),
      "",
    ]);
  }
  return rows;
};

export const runLimits = async (jsonOut = false): Promise<void> => {
  let res;
  try {
    res = await readCodexRateLimits();
  } catch (e) {
    console.error(c.red(`failed: ${(e as Error).message}`));
    console.error(c.dim("hint: ensure `codex` CLI is on PATH and you are signed in"));
    process.exit(1);
  }

  if (jsonOut) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  console.log(c.bold("Codex rate limits"));
  console.log("");
  const cols = [
    { header: c.dim("Limit") },
    { header: c.dim("Window") },
    { header: c.dim("Used"), align: "right" as const },
    { header: c.dim("Resets") },
    { header: c.dim("Plan") },
  ];

  const rows: string[][] = [];
  for (const [, b] of Object.entries(res.rateLimitsByLimitId)) rows.push(...blockRows(b));
  console.log(renderTable(cols, rows));
};
