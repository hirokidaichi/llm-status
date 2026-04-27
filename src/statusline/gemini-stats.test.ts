import { describe, test, expect } from "bun:test";
import { formatTokens } from "./gemini-stats.ts";

describe("formatTokens", () => {
  test("under 1000 stays integer", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1)).toBe("1");
    expect(formatTokens(999)).toBe("999");
  });

  test("thousands use k with one decimal, trimming .0", () => {
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(12345)).toBe("12.3k");
    expect(formatTokens(999_499)).toBe("999.5k");
  });

  test("millions use M", () => {
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_234_567)).toBe("1.2M");
    expect(formatTokens(12_500_000)).toBe("12.5M");
  });
});
