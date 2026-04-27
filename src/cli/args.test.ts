import { describe, test, expect } from "bun:test";
import { parseArgs, num } from "./args.ts";

describe("parseArgs", () => {
  test("positional arg before flags", () => {
    const r = parseArgs(["daily", "--days", "5"]);
    expect(r.positional).toEqual(["daily"]);
    expect(r.flags.days).toBe("5");
  });

  test("--flag=value form", () => {
    const r = parseArgs(["daily", "--days=5"]);
    expect(r.positional).toEqual(["daily"]);
    expect(r.flags.days).toBe("5");
  });

  test("boolean flag (--json) does not eat the next positional", () => {
    const r = parseArgs(["--json", "daily"]);
    expect(r.flags.json).toBe(true);
    expect(r.positional).toEqual(["daily"]);
  });

  test("--help is a boolean flag", () => {
    const r = parseArgs(["--help"]);
    expect(r.flags.help).toBe(true);
  });

  test("-h shorthand", () => {
    const r = parseArgs(["-h"]);
    expect(r.flags.help).toBe(true);
  });

  test("known value flag consumes next token even if it starts with dash", () => {
    const r = parseArgs(["--days", "-1"]);
    expect(r.flags.days).toBe("-1");
    expect(r.positional).toEqual([]);
  });

  test("known value flag with no following token leaves flag truthy", () => {
    const r = parseArgs(["--days"]);
    expect(r.flags.days).toBe(true);
  });

  test("--segments accepts a comma-separated value", () => {
    const r = parseArgs(["statusline", "--segments", "model,branch"]);
    expect(r.flags.segments).toBe("model,branch");
  });

  test("--segments=value form", () => {
    const r = parseArgs(["statusline", "--segments=model,branch"]);
    expect(r.flags.segments).toBe("model,branch");
  });

  test("multiple flags + multiple positionals", () => {
    const r = parseArgs(["session", "--limit", "10", "--days=14"]);
    expect(r.positional).toEqual(["session"]);
    expect(r.flags.limit).toBe("10");
    expect(r.flags.days).toBe("14");
  });
});

describe("num", () => {
  test("positive integer string parses", () => {
    expect(num("5", 7)).toBe(5);
    expect(num("100", 7)).toBe(100);
  });

  test("non-string returns fallback", () => {
    expect(num(undefined, 7)).toBe(7);
    expect(num(true, 7)).toBe(7);
  });

  test("negative numbers fall back", () => {
    expect(num("-1", 7)).toBe(7);
    expect(num("-100", 7)).toBe(7);
  });

  test("decimals fall back (no silent truncation)", () => {
    expect(num("3.5", 7)).toBe(7);
    expect(num("0.5", 7)).toBe(7);
  });

  test("non-numeric strings fall back", () => {
    expect(num("abc", 7)).toBe(7);
    expect(num("", 7)).toBe(7);
    expect(num("5px", 7)).toBe(7);
  });

  test("zero falls back (must be positive)", () => {
    expect(num("0", 7)).toBe(7);
  });
});
