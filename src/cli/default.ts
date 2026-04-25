import { loadClaudeUsage } from "../claude/reader.ts";
import { loadCodexUsage } from "../codex/reader.ts";
import { totalTokens, type UsageEntry } from "../types.ts";
import { c, fmtCost, fmtNum } from "../format/colors.ts";
import { renderTable } from "../format/table.ts";
import { dateKey, startOfToday } from "./aggregate.ts";

type Summary = {
  entries: number;
  input: number;
  cacheCreate: number;
  cacheRead: number;
  output: number;
  reasoning: number;
  cost: number;
  models: Set<string>;
};

const summarize = (entries: UsageEntry[]): Summary => {
  const s: Summary = {
    entries: 0,
    input: 0,
    cacheCreate: 0,
    cacheRead: 0,
    output: 0,
    reasoning: 0,
    cost: 0,
    models: new Set<string>(),
  };
  for (const e of entries) {
    s.entries += 1;
    s.input += e.tokens.input;
    s.cacheCreate += e.tokens.cacheCreation;
    s.cacheRead += e.tokens.cacheRead;
    s.output += e.tokens.output;
    s.reasoning += e.tokens.reasoning;
    s.cost += e.costUsd;
    s.models.add(e.model);
  }
  return s;
};

const totalOf = (s: Summary): number => s.input + s.cacheCreate + s.cacheRead + s.output + s.reasoning;

export const runDefault = async (): Promise<void> => {
  const since = startOfToday();
  const [claude, codex] = await Promise.all([
    loadClaudeUsage({ since }),
    loadCodexUsage({ since }),
  ]);
  const cs = summarize(claude);
  const xs = summarize(codex);

  console.log(c.bold(`Today (${dateKey(since)})`));
  console.log("");

  const cols = [
    { header: c.dim("Provider") },
    { header: c.dim("Sess/Msg"), align: "right" as const },
    { header: c.dim("Input"), align: "right" as const },
    { header: c.dim("Cache W"), align: "right" as const },
    { header: c.dim("Cache R"), align: "right" as const },
    { header: c.dim("Output"), align: "right" as const },
    { header: c.dim("Reason"), align: "right" as const },
    { header: c.dim("Total"), align: "right" as const },
    { header: c.dim("Est. $"), align: "right" as const },
  ];

  const row = (label: string, s: Summary): string[] => [
    label,
    fmtNum(s.entries),
    fmtNum(s.input),
    fmtNum(s.cacheCreate),
    fmtNum(s.cacheRead),
    fmtNum(s.output),
    fmtNum(s.reasoning),
    c.bold(fmtNum(totalOf(s))),
    s.cost === 0 ? c.dim("—") : fmtCost(s.cost),
  ];

  console.log(
    renderTable(cols, [row(c.cyan("Claude"), cs), row(c.magenta("Codex"), xs)]),
  );
  console.log("");
  console.log(
    c.dim(
      `models: claude=[${[...cs.models].join(", ") || "—"}]  codex=[${[...xs.models].join(", ") || "—"}]`,
    ),
  );
  console.log(c.dim("hint: llm-status daily | session | limits | --json"));
};
