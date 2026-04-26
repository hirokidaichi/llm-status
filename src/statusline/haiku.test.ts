import { describe, test, expect } from "bun:test";
import { mechanicalSummary } from "./haiku.ts";

describe("mechanicalSummary", () => {
  test("empty status string returns 'clean'", () => {
    expect(mechanicalSummary("")).toBe("clean");
  });

  test("only modified files: 'M  src/foo.ts\\nM  src/bar.ts' → '2M'", () => {
    const status = "M  src/foo.ts\nM  src/bar.ts";
    expect(mechanicalSummary(status)).toBe("2M");
  });

  test("mix of M/A/D/?? → '1M 1A 1D 1?'", () => {
    const status = "M  a.ts\nA  b.ts\nD  c.ts\n?? d.ts";
    expect(mechanicalSummary(status)).toBe("1M 1A 1D 1?");
  });

  test("renamed file 'R  old.ts -> new.ts' → '1R'", () => {
    const status = "R  old.ts -> new.ts";
    expect(mechanicalSummary(status)).toBe("1R");
  });

  test("untracked only: '?? a.ts\\n?? b.ts' → '2?'", () => {
    const status = "?? a.ts\n?? b.ts";
    expect(mechanicalSummary(status)).toBe("2?");
  });

  test("MM (modified+staged) is counted as M", () => {
    const status = "MM file.ts";
    expect(mechanicalSummary(status)).toBe("1M");
  });

  test("output order follows code branch order: M, A, D, R, ?", () => {
    // Provide one of each kind in deliberately scrambled input order.
    const status = [
      "?? untracked.ts",
      "R  oldname.ts -> newname.ts",
      "D  deleted.ts",
      "A  added.ts",
      "M  modified.ts",
    ].join("\n");
    expect(mechanicalSummary(status)).toBe("1M 1A 1D 1R 1?");
  });

  test("trailing newline doesn't crash", () => {
    const status = "M  a.ts\nA  b.ts\n";
    expect(() => mechanicalSummary(status)).not.toThrow();
    expect(mechanicalSummary(status)).toBe("1M 1A");
  });

  test("unstaged modification ' M file.ts' is recognized as M", () => {
    const status = " M file.ts";
    expect(mechanicalSummary(status)).toBe("1M");
  });
});
