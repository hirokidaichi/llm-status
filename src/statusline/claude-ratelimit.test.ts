import { describe, test, expect } from "bun:test";
import { readClaudeRateLimits } from "./claude-ratelimit";

describe("readClaudeRateLimits", () => {
  test("parses a complete fixture matching the real Anthropic shape", async () => {
    const path = "/tmp/llm-status-test-rl-1.json";
    const fixture = {
      timestamp: 1777077617.388389,
      data: {
        five_hour: { utilization: 38.0, resets_at: "2026-04-25T02:10:01.008895+00:00" },
        seven_day: { utilization: 20.0, resets_at: "2026-04-28T23:00:01.008911+00:00" },
        seven_day_opus: null,
        seven_day_sonnet: { utilization: 6.0, resets_at: "2026-04-28T23:00:01.008918+00:00" },
        extra_usage: {
          is_enabled: true,
          monthly_limit: 20000,
          used_credits: 20823.0,
          utilization: 100.0,
          currency: "USD",
        },
      },
    };
    await Bun.write(path, JSON.stringify(fixture));

    const result = await readClaudeRateLimits(path);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.fiveHour).not.toBeNull();
    expect(result.fiveHour?.utilization).toBe(38.0);
    expect(result.fiveHour?.resetsAt).toBe(Date.parse("2026-04-25T02:10:01.008895+00:00"));

    expect(result.sevenDay).not.toBeNull();
    expect(result.sevenDay?.utilization).toBe(20.0);

    expect(result.sevenDayOpus).toBeNull();

    expect(result.sevenDaySonnet).not.toBeNull();
    expect(result.sevenDaySonnet?.utilization).toBe(6.0);

    expect(result.extraUsage).not.toBeNull();
    expect(result.extraUsage?.utilization).toBe(100.0);

    expect(result.fetchedAt).toBeCloseTo(1777077617388, -1);
  });

  test("returns null when the file does not exist", async () => {
    const result = await readClaudeRateLimits("/tmp/llm-status-test-rl-does-not-exist.json");
    expect(result).toBeNull();
  });

  test("returns null when JSON is malformed", async () => {
    const path = "/tmp/llm-status-test-rl-2.json";
    await Bun.write(path, "{not json}");
    const result = await readClaudeRateLimits(path);
    expect(result).toBeNull();
  });

  test("returns null when the data key is missing", async () => {
    const path = "/tmp/llm-status-test-rl-3.json";
    await Bun.write(path, JSON.stringify({ timestamp: 1777077617.388389 }));
    const result = await readClaudeRateLimits(path);
    expect(result).toBeNull();
  });

  test("parseWindow handles a null window: fiveHour becomes null", async () => {
    const path = "/tmp/llm-status-test-rl-4.json";
    const fixture = {
      timestamp: 1777077617.388389,
      data: {
        five_hour: null,
        seven_day: { utilization: 20.0, resets_at: "2026-04-28T23:00:01.008911+00:00" },
      },
    };
    await Bun.write(path, JSON.stringify(fixture));
    const result = await readClaudeRateLimits(path);
    expect(result).not.toBeNull();
    expect(result?.fiveHour).toBeNull();
  });

  test("parseWindow returns null when utilization is missing", async () => {
    const path = "/tmp/llm-status-test-rl-5.json";
    const fixture = {
      timestamp: 1777077617.388389,
      data: {
        five_hour: { resets_at: "2026-04-25T02:10:01.008895+00:00" },
      },
    };
    await Bun.write(path, JSON.stringify(fixture));
    const result = await readClaudeRateLimits(path);
    expect(result).not.toBeNull();
    expect(result?.fiveHour).toBeNull();
  });

  test("parseWindow returns utilization with null resetsAt when resets_at is missing", async () => {
    const path = "/tmp/llm-status-test-rl-6.json";
    const fixture = {
      timestamp: 1777077617.388389,
      data: {
        five_hour: { utilization: 42.0 },
      },
    };
    await Bun.write(path, JSON.stringify(fixture));
    const result = await readClaudeRateLimits(path);
    expect(result).not.toBeNull();
    expect(result?.fiveHour).not.toBeNull();
    expect(result?.fiveHour?.utilization).toBe(42.0);
    expect(result?.fiveHour?.resetsAt).toBeNull();
  });

  test("extra_usage with is_enabled false yields null extraUsage", async () => {
    const path = "/tmp/llm-status-test-rl-7.json";
    const fixture = {
      timestamp: 1777077617.388389,
      data: {
        five_hour: { utilization: 1.0, resets_at: "2026-04-25T02:10:01.008895+00:00" },
        extra_usage: {
          is_enabled: false,
          monthly_limit: 20000,
          used_credits: 0,
          utilization: 0,
          currency: "USD",
        },
      },
    };
    await Bun.write(path, JSON.stringify(fixture));
    const result = await readClaudeRateLimits(path);
    expect(result).not.toBeNull();
    expect(result?.extraUsage).toBeNull();
  });
});
