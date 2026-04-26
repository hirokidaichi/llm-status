import { describe, test, expect } from "bun:test";
import {
  dateKey,
  groupDaily,
  groupSession,
  startOfDaysAgo,
  startOfToday,
} from "./aggregate.ts";
import type { TokenBreakdown, UsageEntry } from "../types.ts";

const tokens = (overrides: Partial<TokenBreakdown> = {}): TokenBreakdown => ({
  input: 0,
  cacheCreation: 0,
  cacheRead: 0,
  output: 0,
  reasoning: 0,
  ...overrides,
});

const makeEntry = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
  provider: "claude",
  timestamp: new Date("2026-04-25T10:00:00Z"),
  model: "claude-sonnet-4",
  sessionId: "session-a",
  tokens: tokens(),
  costUsd: 0,
  ...overrides,
});

describe("dateKey", () => {
  test("formats local-tz date as YYYY-MM-DD with zero padding", () => {
    // Construct a Date using local-time components so the assertion is tz-independent.
    const d = new Date(2026, 0, 5, 12, 34, 56); // Jan 5 2026 local
    expect(dateKey(d)).toBe("2026-01-05");
  });

  test("zero-pads single-digit month and day", () => {
    const d = new Date(2026, 8, 9, 0, 0, 0); // Sep 9 2026 local
    expect(dateKey(d)).toBe("2026-09-09");
  });

  test("handles two-digit month and day without extra padding", () => {
    const d = new Date(2026, 11, 31, 23, 59, 59); // Dec 31 2026 local
    expect(dateKey(d)).toBe("2026-12-31");
  });
});

describe("startOfToday", () => {
  test("returns a Date with hours/minutes/seconds/ms set to 0", () => {
    const d = startOfToday();
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  test("is the same calendar day as 'now' in local time", () => {
    const now = new Date();
    const d = startOfToday();
    expect(d.getFullYear()).toBe(now.getFullYear());
    expect(d.getMonth()).toBe(now.getMonth());
    expect(d.getDate()).toBe(now.getDate());
  });
});

describe("startOfDaysAgo", () => {
  test("returns a Date 7 days before today at 00:00:00.000", () => {
    const d = startOfDaysAgo(7);
    const today = startOfToday();
    const diffMs = today.getTime() - d.getTime();
    // 7 days, accounting for possible DST transitions (which would shift by 1 hour at most).
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;
    expect(Math.abs(diffMs - sevenDaysMs)).toBeLessThanOrEqual(oneHourMs);

    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  test("startOfDaysAgo(0) equals startOfToday", () => {
    const a = startOfDaysAgo(0);
    const b = startOfToday();
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("groupDaily", () => {
  test("returns an empty array for empty input", () => {
    expect(groupDaily([])).toEqual([]);
  });

  test("aggregates multiple entries with the same day+provider into one bucket", () => {
    const ts1 = new Date(2026, 3, 25, 9, 0, 0);
    const ts2 = new Date(2026, 3, 25, 18, 0, 0);
    const entries: UsageEntry[] = [
      makeEntry({
        timestamp: ts1,
        model: "claude-sonnet-4",
        tokens: tokens({ input: 10, output: 20, cacheCreation: 1, cacheRead: 2, reasoning: 3 }),
        costUsd: 0.5,
      }),
      makeEntry({
        timestamp: ts2,
        model: "claude-opus-4",
        tokens: tokens({ input: 5, output: 7, cacheCreation: 4, cacheRead: 6, reasoning: 8 }),
        costUsd: 1.25,
      }),
    ];

    const result = groupDaily(entries);
    expect(result.length).toBe(1);
    const b = result[0]!;
    expect(b.date).toBe("2026-04-25");
    expect(b.provider).toBe("claude");
    expect(b.entries).toBe(2);
    expect(b.tokens.input).toBe(15);
    expect(b.tokens.output).toBe(27);
    expect(b.tokens.cacheCreation).toBe(5);
    expect(b.tokens.cacheRead).toBe(8);
    expect(b.tokens.reasoning).toBe(11);
    expect(b.costUsd).toBeCloseTo(1.75, 10);
    expect(b.models instanceof Set).toBe(true);
    expect(b.models.size).toBe(2);
    expect(b.models.has("claude-sonnet-4")).toBe(true);
    expect(b.models.has("claude-opus-4")).toBe(true);
  });

  test("creates separate buckets for the same day with different providers", () => {
    const ts = new Date(2026, 3, 25, 12, 0, 0);
    const entries: UsageEntry[] = [
      makeEntry({ provider: "claude", timestamp: ts, costUsd: 1 }),
      makeEntry({ provider: "codex", timestamp: ts, costUsd: 2 }),
      makeEntry({ provider: "gemini", timestamp: ts, costUsd: 3 }),
    ];
    const result = groupDaily(entries);
    expect(result.length).toBe(3);
    // Sorted by date asc (all same), then provider asc (localeCompare): claude, codex, gemini.
    expect(result.map((b) => b.provider)).toEqual(["claude", "codex", "gemini"]);
    expect(result.every((b) => b.date === "2026-04-25")).toBe(true);
  });

  test("creates separate buckets for different days (same provider)", () => {
    const entries: UsageEntry[] = [
      makeEntry({ timestamp: new Date(2026, 3, 25, 10, 0, 0), costUsd: 1 }),
      makeEntry({ timestamp: new Date(2026, 3, 26, 10, 0, 0), costUsd: 2 }),
    ];
    const result = groupDaily(entries);
    expect(result.length).toBe(2);
    expect(result[0]!.date).toBe("2026-04-25");
    expect(result[1]!.date).toBe("2026-04-26");
  });

  test("output is sorted by date asc, then provider asc", () => {
    const entries: UsageEntry[] = [
      makeEntry({ provider: "gemini", timestamp: new Date(2026, 3, 26, 10, 0, 0) }),
      makeEntry({ provider: "claude", timestamp: new Date(2026, 3, 26, 10, 0, 0) }),
      makeEntry({ provider: "codex", timestamp: new Date(2026, 3, 25, 10, 0, 0) }),
      makeEntry({ provider: "claude", timestamp: new Date(2026, 3, 25, 10, 0, 0) }),
    ];
    const result = groupDaily(entries);
    expect(result.map((b) => `${b.date}/${b.provider}`)).toEqual([
      "2026-04-25/claude",
      "2026-04-25/codex",
      "2026-04-26/claude",
      "2026-04-26/gemini",
    ]);
  });

  test("models set deduplicates identical model strings", () => {
    const ts = new Date(2026, 3, 25, 10, 0, 0);
    const entries: UsageEntry[] = [
      makeEntry({ timestamp: ts, model: "claude-sonnet-4" }),
      makeEntry({ timestamp: ts, model: "claude-sonnet-4" }),
      makeEntry({ timestamp: ts, model: "claude-opus-4" }),
    ];
    const result = groupDaily(entries);
    expect(result.length).toBe(1);
    expect(result[0]!.models.size).toBe(2);
  });
});

describe("groupSession", () => {
  test("returns an empty array for empty input", () => {
    expect(groupSession([])).toEqual([]);
  });

  test("aggregates entries with the same provider+sessionId, tracking firstTs (min) and lastTs (max)", () => {
    const t1 = new Date("2026-04-25T08:00:00Z");
    const t2 = new Date("2026-04-25T12:00:00Z");
    const t3 = new Date("2026-04-25T16:00:00Z");
    // Insert out of order to ensure firstTs/lastTs come from min/max, not insertion order.
    const entries: UsageEntry[] = [
      makeEntry({
        sessionId: "s1",
        timestamp: t2,
        model: "claude-sonnet-4",
        tokens: tokens({ input: 1, output: 2, cacheCreation: 3, cacheRead: 4, reasoning: 5 }),
        costUsd: 0.1,
      }),
      makeEntry({
        sessionId: "s1",
        timestamp: t1,
        model: "claude-opus-4",
        tokens: tokens({ input: 10, output: 20, cacheCreation: 30, cacheRead: 40, reasoning: 50 }),
        costUsd: 0.2,
      }),
      makeEntry({
        sessionId: "s1",
        timestamp: t3,
        model: "claude-sonnet-4",
        tokens: tokens({ input: 100, output: 200, cacheCreation: 300, cacheRead: 400, reasoning: 500 }),
        costUsd: 0.3,
      }),
    ];

    const result = groupSession(entries);
    expect(result.length).toBe(1);
    const b = result[0]!;
    expect(b.sessionId).toBe("s1");
    expect(b.provider).toBe("claude");
    expect(b.firstTs.getTime()).toBe(t1.getTime());
    expect(b.lastTs.getTime()).toBe(t3.getTime());
    expect(b.entries).toBe(3);
    expect(b.tokens.input).toBe(111);
    expect(b.tokens.output).toBe(222);
    expect(b.tokens.cacheCreation).toBe(333);
    expect(b.tokens.cacheRead).toBe(444);
    expect(b.tokens.reasoning).toBe(555);
    expect(b.costUsd).toBeCloseTo(0.6, 10);
    expect(b.models.size).toBe(2);
    expect(b.models.has("claude-sonnet-4")).toBe(true);
    expect(b.models.has("claude-opus-4")).toBe(true);
  });

  test("creates separate buckets for different sessionIds", () => {
    const ts = new Date("2026-04-25T10:00:00Z");
    const entries: UsageEntry[] = [
      makeEntry({ sessionId: "s1", timestamp: ts }),
      makeEntry({ sessionId: "s2", timestamp: ts }),
    ];
    const result = groupSession(entries);
    expect(result.length).toBe(2);
    const ids = result.map((b) => b.sessionId).sort();
    expect(ids).toEqual(["s1", "s2"]);
  });

  test("creates separate buckets when same sessionId is used by different providers", () => {
    const ts = new Date("2026-04-25T10:00:00Z");
    const entries: UsageEntry[] = [
      makeEntry({ provider: "claude", sessionId: "shared", timestamp: ts }),
      makeEntry({ provider: "codex", sessionId: "shared", timestamp: ts }),
    ];
    const result = groupSession(entries);
    expect(result.length).toBe(2);
  });

  test("output is sorted by lastTs descending", () => {
    const tEarly = new Date("2026-04-20T10:00:00Z");
    const tMid = new Date("2026-04-23T10:00:00Z");
    const tLate = new Date("2026-04-25T10:00:00Z");

    const entries: UsageEntry[] = [
      makeEntry({ sessionId: "early", timestamp: tEarly }),
      makeEntry({ sessionId: "late", timestamp: tLate }),
      makeEntry({ sessionId: "mid", timestamp: tMid }),
    ];

    const result = groupSession(entries);
    expect(result.map((b) => b.sessionId)).toEqual(["late", "mid", "early"]);
  });
});
