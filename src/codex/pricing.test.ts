import { describe, test, expect } from "bun:test";

import { codexCost, codexPrice } from "./pricing";

describe("codexPrice", () => {
  test("gpt-5-codex-latest matches the gpt-5-codex pattern (specific before generic)", () => {
    const p = codexPrice("gpt-5-codex-latest");
    expect(p).not.toBeNull();
    expect(p!.input).toBe(1.25);
    expect(p!.cachedInput).toBe(0.125);
    expect(p!.output).toBe(10);
  });

  test("gpt-5.3-thinking matches the gpt-5.3 pattern", () => {
    const p = codexPrice("gpt-5.3-thinking");
    expect(p).not.toBeNull();
    expect(p!.input).toBe(1.25);
    expect(p!.cachedInput).toBe(0.125);
    expect(p!.output).toBe(10);
  });

  test("gpt-5-mini matches the generic gpt-5 pattern", () => {
    const p = codexPrice("gpt-5-mini");
    expect(p).not.toBeNull();
    expect(p!.input).toBe(1.25);
    expect(p!.cachedInput).toBe(0.125);
    expect(p!.output).toBe(10);
  });

  test("gpt-4.1-mini matches the specific gpt-4.1-mini pattern (NOT gpt-4.1)", () => {
    const p = codexPrice("gpt-4.1-mini");
    expect(p).not.toBeNull();
    expect(p!.input).toBeCloseTo(0.4, 6);
    expect(p!.cachedInput).toBeCloseTo(0.1, 6);
    expect(p!.output).toBeCloseTo(1.6, 6);
  });

  test("gpt-4.1 matches the generic gpt-4.1 pattern", () => {
    const p = codexPrice("gpt-4.1");
    expect(p).not.toBeNull();
    expect(p!.input).toBe(2);
    expect(p!.cachedInput).toBe(0.5);
    expect(p!.output).toBe(8);
  });

  test("o3-mini matches the specific o3-mini pattern (NOT o3)", () => {
    const p = codexPrice("o3-mini");
    expect(p).not.toBeNull();
    expect(p!.input).toBeCloseTo(1.1, 6);
    expect(p!.cachedInput).toBeCloseTo(0.275, 6);
    expect(p!.output).toBeCloseTo(4.4, 6);
  });

  test("o3-pro matches the generic o3 pattern", () => {
    const p = codexPrice("o3-pro");
    expect(p).not.toBeNull();
    expect(p!.input).toBe(2);
    expect(p!.cachedInput).toBe(0.5);
    expect(p!.output).toBe(8);
  });

  test("o4-mini matches the o4-mini pattern", () => {
    const p = codexPrice("o4-mini");
    expect(p).not.toBeNull();
    expect(p!.input).toBeCloseTo(1.1, 6);
    expect(p!.cachedInput).toBeCloseTo(0.275, 6);
    expect(p!.output).toBeCloseTo(4.4, 6);
  });

  test("returns null for unknown models", () => {
    expect(codexPrice("unknown")).toBe(null);
  });
});

describe("codexCost", () => {
  test("bills input tokens at the input rate when no cache hits", () => {
    // 1M input * $1.25/M = 1.25
    expect(
      codexCost("gpt-5", {
        input: 1_000_000,
        cacheRead: 0,
        output: 0,
        reasoning: 0,
      }),
    ).toBeCloseTo(1.25, 6);
  });

  test("input and cacheRead are billed independently (exclusive fields)", () => {
    // 0M billed input + 1M cacheRead * $0.125/M = 0.125
    expect(
      codexCost("gpt-5", {
        input: 0,
        cacheRead: 1_000_000,
        output: 0,
        reasoning: 0,
      }),
    ).toBeCloseTo(0.125, 6);
  });

  test("input portion bills at full rate, cacheRead at discounted rate", () => {
    // 1M @ 1.25 + 1M @ 0.125 = 1.375
    expect(
      codexCost("gpt-5", {
        input: 1_000_000,
        cacheRead: 1_000_000,
        output: 0,
        reasoning: 0,
      }),
    ).toBeCloseTo(1.375, 6);
  });

  test("bills reasoning_output_tokens at the output rate", () => {
    // 1M reasoning * $10/M = 10
    expect(
      codexCost("gpt-5", {
        input: 0,
        cacheRead: 0,
        output: 0,
        reasoning: 1_000_000,
      }),
    ).toBe(10);
  });

  test("combines output and reasoning at the output rate", () => {
    // (500k output + 500k reasoning) * $10/M = 10
    expect(
      codexCost("gpt-5", {
        input: 0,
        cacheRead: 0,
        output: 500_000,
        reasoning: 500_000,
      }),
    ).toBe(10);
  });

  test("returns 0 for unknown models regardless of token usage", () => {
    expect(
      codexCost("unknown", {
        input: 1_000_000,
        cacheRead: 2_000_000,
        output: 3_000_000,
        reasoning: 4_000_000,
      }),
    ).toBe(0);
  });

  test("returns 0 for zero tokens", () => {
    expect(
      codexCost("gpt-5", {
        input: 0,
        cacheRead: 0,
        output: 0,
        reasoning: 0,
      }),
    ).toBe(0);
  });
});
