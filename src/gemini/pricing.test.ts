import { describe, expect, test } from "bun:test";
import { geminiCost, geminiPrice } from "./pricing";

describe("geminiPrice", () => {
  test("gemini-3-pro returns correct prices", () => {
    const p = geminiPrice("gemini-3-pro");
    expect(p).not.toBeNull();
    expect(p?.input).toBe(2);
    expect(p?.cachedInput).toBeCloseTo(0.5, 6);
    expect(p?.output).toBe(12);
  });

  test("gemini-3-flash returns correct prices", () => {
    const p = geminiPrice("gemini-3-flash");
    expect(p).not.toBeNull();
    expect(p?.input).toBeCloseTo(0.3, 6);
    expect(p?.cachedInput).toBeCloseTo(0.075, 6);
    expect(p?.output).toBeCloseTo(2.5, 6);
  });

  test("gemini-2.5-pro returns correct prices", () => {
    const p = geminiPrice("gemini-2.5-pro");
    expect(p).not.toBeNull();
    expect(p?.input).toBeCloseTo(1.25, 6);
    expect(p?.cachedInput).toBeCloseTo(0.31, 6);
    expect(p?.output).toBe(10);
  });

  test("gemini-2.5-flash-lite returns correct prices (must not match gemini-2.5-flash)", () => {
    const p = geminiPrice("gemini-2.5-flash-lite");
    expect(p).not.toBeNull();
    expect(p?.input).toBeCloseTo(0.1, 6);
    expect(p?.cachedInput).toBeCloseTo(0.025, 6);
    expect(p?.output).toBeCloseTo(0.4, 6);
  });

  test("gemini-2.5-flash returns correct prices", () => {
    const p = geminiPrice("gemini-2.5-flash");
    expect(p).not.toBeNull();
    expect(p?.input).toBeCloseTo(0.3, 6);
    expect(p?.cachedInput).toBeCloseTo(0.075, 6);
    expect(p?.output).toBeCloseTo(2.5, 6);
  });

  test("gemini-2.0-flash-lite returns correct prices", () => {
    const p = geminiPrice("gemini-2.0-flash-lite");
    expect(p).not.toBeNull();
    expect(p?.input).toBeCloseTo(0.075, 6);
    expect(p?.cachedInput).toBeCloseTo(0.019, 6);
    expect(p?.output).toBeCloseTo(0.3, 6);
  });

  test("gemini-2.0-flash returns correct prices", () => {
    const p = geminiPrice("gemini-2.0-flash");
    expect(p).not.toBeNull();
    expect(p?.input).toBeCloseTo(0.1, 6);
    expect(p?.cachedInput).toBeCloseTo(0.025, 6);
    expect(p?.output).toBeCloseTo(0.4, 6);
  });

  test("gemini-1.5-pro returns correct prices", () => {
    const p = geminiPrice("gemini-1.5-pro");
    expect(p).not.toBeNull();
    expect(p?.input).toBeCloseTo(1.25, 6);
    expect(p?.cachedInput).toBeCloseTo(0.3125, 6);
    expect(p?.output).toBe(5);
  });

  test("gemini-1.5-flash returns correct prices", () => {
    const p = geminiPrice("gemini-1.5-flash");
    expect(p).not.toBeNull();
    expect(p?.input).toBeCloseTo(0.075, 6);
    expect(p?.cachedInput).toBeCloseTo(0.019, 6);
    expect(p?.output).toBeCloseTo(0.3, 6);
  });

  test("unknown model returns null", () => {
    expect(geminiPrice("unknown-model")).toBeNull();
  });
});

describe("geminiCost", () => {
  test("input and cacheRead are billed independently (exclusive fields)", () => {
    const cost = geminiCost("gemini-2.5-pro", {
      input: 0,
      cacheRead: 1_000_000,
      output: 0,
      reasoning: 0,
    });
    expect(cost).toBeCloseTo(0.31, 6);
  });

  test("input portion bills at full input rate, cacheRead at discounted rate", () => {
    const cost = geminiCost("gemini-2.5-pro", {
      input: 1_000_000,
      cacheRead: 1_000_000,
      output: 0,
      reasoning: 0,
    });
    // 1M @ 1.25 + 1M @ 0.31 = 1.56
    expect(cost).toBeCloseTo(1.56, 6);
  });

  test("reasoning tokens are billed at output rate", () => {
    const cost = geminiCost("gemini-2.5-pro", {
      input: 0,
      cacheRead: 0,
      output: 0,
      reasoning: 1_000_000,
    });
    expect(cost).toBe(10);
  });

  test("unknown model returns 0", () => {
    const cost = geminiCost("unknown", {
      input: 1_000_000,
      cacheRead: 1_000_000,
      output: 1_000_000,
      reasoning: 1_000_000,
    });
    expect(cost).toBe(0);
  });

  test("zero tokens return 0", () => {
    const cost = geminiCost("gemini-2.5-pro", {
      input: 0,
      cacheRead: 0,
      output: 0,
      reasoning: 0,
    });
    expect(cost).toBe(0);
  });
});
