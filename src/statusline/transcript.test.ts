import { describe, test, expect } from "bun:test";
import { readContextSize } from "./transcript";

const writeFixture = async (n: number, contents: string): Promise<string> => {
  const path = `/tmp/llm-status-test-transcript-${n}.jsonl`;
  await Bun.write(path, contents);
  return path;
};

describe("readContextSize", () => {
  test("parses a simple JSONL with one assistant entry", async () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-opus-4-7",
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          cache_creation_input_tokens: 50,
          cache_read_input_tokens: 1000,
        },
      },
    });
    const path = await writeFixture(1, line + "\n");
    const result = await readContextSize(path);
    expect(result).toEqual({
      used: 1150,
      max: 1_000_000,
      model: "claude-opus-4-7",
    });
  });

  test("picks the LAST assistant entry when multiple exist", async () => {
    const first = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-opus-4-7",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    });
    const second = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 1,
          output_tokens: 2,
          cache_creation_input_tokens: 3,
          cache_read_input_tokens: 4,
        },
      },
    });
    const path = await writeFixture(2, first + "\n" + second + "\n");
    const result = await readContextSize(path);
    expect(result).toEqual({
      used: 1 + 3 + 4,
      max: 1_000_000,
      model: "claude-sonnet-4-6",
    });
  });

  test("skips non-assistant rows (user, tool_use, tool_result)", async () => {
    const userRow = JSON.stringify({
      type: "user",
      message: { content: "hi" },
    });
    const toolUse = JSON.stringify({
      type: "tool_use",
      message: {
        usage: {
          input_tokens: 9999,
          cache_creation_input_tokens: 9999,
          cache_read_input_tokens: 9999,
        },
      },
    });
    const toolResult = JSON.stringify({
      type: "tool_result",
      message: {
        usage: {
          input_tokens: 9999,
          cache_creation_input_tokens: 9999,
          cache_read_input_tokens: 9999,
        },
      },
    });
    const assistant = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-opus-4-7",
        usage: {
          input_tokens: 7,
          output_tokens: 0,
          cache_creation_input_tokens: 11,
          cache_read_input_tokens: 13,
        },
      },
    });
    // Add more non-assistant rows after the assistant to ensure they are skipped
    const path = await writeFixture(
      3,
      [userRow, toolUse, assistant, toolResult, userRow].join("\n") + "\n",
    );
    const result = await readContextSize(path);
    expect(result).toEqual({
      used: 7 + 11 + 13,
      max: 1_000_000,
      model: "claude-opus-4-7",
    });
  });

  test("returns null when no assistant message has usage", async () => {
    const userRow = JSON.stringify({
      type: "user",
      message: { content: "hi" },
    });
    const path = await writeFixture(4, userRow + "\n" + userRow + "\n");
    const result = await readContextSize(path);
    expect(result).toBeNull();
  });

  test("returns null when file is empty", async () => {
    const path = await writeFixture(5, "");
    const result = await readContextSize(path);
    expect(result).toBeNull();
  });

  test("returns null when file doesn't exist", async () => {
    const result = await readContextSize(
      "/tmp/llm-status-test-transcript-does-not-exist-xyz.jsonl",
    );
    expect(result).toBeNull();
  });

  test("returns null when file has only invalid JSON lines", async () => {
    const path = await writeFixture(6, "not json\nalso not json\n{broken\n");
    const result = await readContextSize(path);
    expect(result).toBeNull();
  });

  test("skips assistant entries without usage object", async () => {
    const assistantNoUsage = JSON.stringify({
      type: "assistant",
      message: { model: "claude-opus-4-7" },
    });
    const assistantWithUsage = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-opus-4-7",
        usage: {
          input_tokens: 1,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3,
        },
      },
    });
    // Place no-usage entry AFTER the with-usage entry; the function walks
    // bottom-up and should skip the no-usage one and find the prior one.
    const path = await writeFixture(
      7,
      assistantWithUsage + "\n" + assistantNoUsage + "\n",
    );
    const result = await readContextSize(path);
    expect(result).toEqual({
      used: 1 + 2 + 3,
      max: 1_000_000,
      model: "claude-opus-4-7",
    });
  });

  describe("model context window mapping", () => {
    const mkLine = (model: string) =>
      JSON.stringify({
        type: "assistant",
        message: {
          model,
          usage: {
            input_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      }) + "\n";

    test("claude-opus-4-7 -> 1_000_000", async () => {
      const path = await writeFixture(8, mkLine("claude-opus-4-7"));
      const result = await readContextSize(path);
      expect(result?.max).toBe(1_000_000);
      expect(result?.model).toBe("claude-opus-4-7");
    });

    test("claude-sonnet-4-6 -> 1_000_000", async () => {
      const path = await writeFixture(9, mkLine("claude-sonnet-4-6"));
      const result = await readContextSize(path);
      expect(result?.max).toBe(1_000_000);
      expect(result?.model).toBe("claude-sonnet-4-6");
    });

    test("claude-haiku-4-5-20251001 -> 200_000", async () => {
      const path = await writeFixture(10, mkLine("claude-haiku-4-5-20251001"));
      const result = await readContextSize(path);
      expect(result?.max).toBe(200_000);
      expect(result?.model).toBe("claude-haiku-4-5-20251001");
    });

    test("claude-opus-3-5 -> 200_000", async () => {
      const path = await writeFixture(11, mkLine("claude-opus-3-5"));
      const result = await readContextSize(path);
      expect(result?.max).toBe(200_000);
      expect(result?.model).toBe("claude-opus-3-5");
    });

    test("unknown-model -> 200_000 default", async () => {
      const path = await writeFixture(12, mkLine("unknown-model"));
      const result = await readContextSize(path);
      expect(result?.max).toBe(200_000);
      expect(result?.model).toBe("unknown-model");
    });
  });

  test("only reads tail: 1MB of garbage prefix + real assistant entry at end", async () => {
    // 1MB of garbage that is valid-ish but not assistant-with-usage rows.
    // Use a non-{ leading character so the parser bails fast on those lines,
    // and ensure the line is wider than tail anyway.
    const garbageLine = "x".repeat(1024); // 1KB per line, no leading {
    const garbageBlock = (garbageLine + "\n").repeat(1024); // ~1MB
    const realLine =
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-opus-4-7",
          usage: {
            input_tokens: 100,
            output_tokens: 200,
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 1000,
          },
        },
      }) + "\n";
    const path = await writeFixture(13, garbageBlock + realLine);
    const result = await readContextSize(path);
    expect(result).toEqual({
      used: 1150,
      max: 1_000_000,
      model: "claude-opus-4-7",
    });
  });
});
