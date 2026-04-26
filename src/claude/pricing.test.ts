import { describe, expect, test } from "bun:test";
import { claudeCost, claudePrice } from "./pricing.ts";

describe("claudePrice", () => {
  test("returns prices for each model regex pattern", () => {
    const cases = [
      {
        model: "claude-opus-4-7",
        expected: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
      },
      {
        model: "claude-sonnet-4-6",
        expected: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
      },
      {
        model: "claude-haiku-4-5-20251001",
        expected: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
      },
      {
        model: "claude-sonnet-3-5",
        expected: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
      },
      {
        model: "claude-haiku-3-5",
        expected: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
      },
      {
        model: "claude-opus-3-5",
        expected: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
      },
    ];

    for (const { model, expected } of cases) {
      const price = claudePrice(model);

      expect(price).not.toBeNull();
      expect(price?.input).toBeCloseTo(expected.input, 6);
      expect(price?.output).toBeCloseTo(expected.output, 6);
      expect(price?.cacheWrite).toBeCloseTo(expected.cacheWrite, 6);
      expect(price?.cacheRead).toBeCloseTo(expected.cacheRead, 6);
    }
  });

  test("returns null for unknown and empty model names", () => {
    expect(claudePrice("unknown")).toBeNull();
    expect(claudePrice("")).toBeNull();
  });
});

describe("claudeCost", () => {
  test("calculates input-only billing", () => {
    expect(
      claudeCost("claude-sonnet-4-6", {
        input: 1_000_000,
        output: 0,
        cacheCreation: 0,
        cacheRead: 0,
      }),
    ).toBe(3);
  });

  test("calculates output-only billing", () => {
    expect(
      claudeCost("claude-sonnet-4-6", {
        input: 0,
        output: 1_000_000,
        cacheCreation: 0,
        cacheRead: 0,
      }),
    ).toBe(15);
  });

  test("calculates cacheCreation-only billing", () => {
    expect(
      claudeCost("claude-opus-4-7", {
        input: 0,
        output: 0,
        cacheCreation: 1_000_000,
        cacheRead: 0,
      }),
    ).toBeCloseTo(18.75, 6);
  });

  test("calculates cacheRead-only billing", () => {
    expect(
      claudeCost("claude-sonnet-4-6", {
        input: 0,
        output: 0,
        cacheCreation: 0,
        cacheRead: 1_000_000,
      }),
    ).toBeCloseTo(0.3, 6);
  });

  test("calculates mixed token billing", () => {
    expect(
      claudeCost("claude-haiku-3-5", {
        input: 1_000_000,
        output: 500_000,
        cacheCreation: 250_000,
        cacheRead: 125_000,
      }),
    ).toBeCloseTo(3.06, 6);
  });

  test("returns 0 for unknown models", () => {
    expect(
      claudeCost("unknown-model", {
        input: 1_000_000,
        output: 1_000_000,
        cacheCreation: 1_000_000,
        cacheRead: 1_000_000,
      }),
    ).toBe(0);
  });

  test("returns 0 for zero tokens", () => {
    expect(
      claudeCost("claude-opus-4-7", {
        input: 0,
        output: 0,
        cacheCreation: 0,
        cacheRead: 0,
      }),
    ).toBe(0);
  });
});
