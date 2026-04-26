import { describe, test, expect } from "bun:test";
import { renderCodex } from "./codex.ts";
import type { RateBlock, RateLimitsResult, RateWindow } from "../codex/app-server.ts";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const nowSec = () => Math.floor(Date.now() / 1000);

const makeWindow = (
  usedPercent: number,
  windowDurationMins: number,
  resetsAt: number,
): RateWindow => ({
  usedPercent,
  windowDurationMins,
  resetsAt,
});

const makeBlock = (
  primary: RateWindow | null,
  secondary: RateWindow | null,
): RateBlock => ({
  limitId: "test",
  limitName: null,
  primary,
  secondary,
  planType: null,
  rateLimitReachedType: null,
  credits: null,
});

const makeData = (block: RateBlock): RateLimitsResult => ({
  rateLimits: block,
  rateLimitsByLimitId: { test: block },
});

describe("renderCodex - null data", () => {
  test('null + "compact" => "Codex —"', () => {
    expect(strip(renderCodex(null, "compact"))).toBe("⚡ Codex —");
  });

  test('null + "minimal" => "—"', () => {
    expect(strip(renderCodex(null, "minimal"))).toBe("—");
  });

  test('null + "full" => "Codex —"', () => {
    expect(strip(renderCodex(null, "full"))).toBe("⚡ Codex —");
  });
});

describe("renderCodex - primary + secondary", () => {
  const primary = makeWindow(10, 300, nowSec() + 3600);
  const secondary = makeWindow(5, 10080, nowSec() + 7 * 24 * 3600);
  const data = makeData(makeBlock(primary, secondary));

  test('"minimal" => "5h:10% 7d:5%"', () => {
    expect(strip(renderCodex(data, "minimal"))).toBe("5h:10% 7d:5%");
  });

  test('"compact" => "Codex 5h 10% / 7d 5%"', () => {
    expect(strip(renderCodex(data, "compact"))).toBe("⚡ Codex 5h 10% / 7d 5%");
  });

  test('"full" => contains label and window pieces', () => {
    const out = strip(renderCodex(data, "full"));
    expect(out).toContain("Codex");
    expect(out).toContain("5h 10%(");
    expect(out).toContain("7d 5%(");
  });
});

describe("renderCodex - primary only", () => {
  test('compact => "Codex 5h 10%" (no slash)', () => {
    const data = makeData(makeBlock(makeWindow(10, 300, nowSec() + 3600), null));
    const out = strip(renderCodex(data, "compact"));
    expect(out).toBe("⚡ Codex 5h 10%");
    expect(out).not.toContain("/");
  });
});

describe("renderCodex - both windows null", () => {
  test('compact => "Codex —"', () => {
    const data = makeData(makeBlock(null, null));
    expect(strip(renderCodex(data, "compact"))).toBe("⚡ Codex —");
  });
});

describe("renderCodex - window duration label mapping", () => {
  const cases: Array<[number, string]> = [
    [30, "30m"],
    [300, "5h"],
    [60, "1h"],
    [10080, "7d"],
  ];

  for (const [mins, label] of cases) {
    test(`${mins} mins => "${label}"`, () => {
      const data = makeData(makeBlock(makeWindow(42, mins, nowSec() + 3600), null));
      const out = strip(renderCodex(data, "minimal"));
      expect(out).toBe(`${label}:42%`);
    });
  }
});

describe("renderCodex - pickup behavior", () => {
  test("falls back to first value of rateLimitsByLimitId when rateLimits is null", () => {
    const blockA = makeBlock(makeWindow(20, 300, nowSec() + 3600), null);
    // Cast to any-friendly shape: RateLimitsResult declares rateLimits as RateBlock,
    // but pickBlock checks for falsy and falls through. Replicate that scenario.
    const data = {
      rateLimits: null,
      rateLimitsByLimitId: { foo: blockA },
    } as unknown as RateLimitsResult;
    const out = strip(renderCodex(data, "compact"));
    expect(out).toBe("⚡ Codex 5h 20%");
  });
});
