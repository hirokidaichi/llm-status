import { loadClaudeUsage } from "../claude/reader.ts";
import { loadCodexUsage } from "../codex/reader.ts";
import { loadGeminiUsage } from "../gemini/reader.ts";
import { groupDaily, groupSession, startOfDaysAgo, startOfToday } from "./aggregate.ts";

export const runJson = async (mode: "today" | "daily" | "session", days = 7): Promise<void> => {
  const since = mode === "today" ? startOfToday() : startOfDaysAgo(days - 1);
  const [claude, codex, gemini] = await Promise.all([
    loadClaudeUsage({ since }),
    loadCodexUsage({ since }),
    loadGeminiUsage({ since }),
  ]);
  if (mode === "session") {
    const data = groupSession([...claude, ...codex, ...gemini]).map((s) => ({
      ...s,
      models: [...s.models],
      firstTs: s.firstTs.toISOString(),
      lastTs: s.lastTs.toISOString(),
    }));
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (mode === "daily") {
    const data = groupDaily([...claude, ...codex, ...gemini]).map((b) => ({
      ...b,
      models: [...b.models],
    }));
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  const all = [...claude, ...codex, ...gemini].map((e) => ({
    ...e,
    timestamp: e.timestamp.toISOString(),
  }));
  console.log(JSON.stringify(all, null, 2));
};
