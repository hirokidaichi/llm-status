import { describe, test, expect } from "bun:test";
import {
  ctxSegment,
  fiveHourSegment,
  sevenDaySegment,
  fromStdinWindow,
  freshFromCache,
  battery,
  FIVE_HOUR_MS,
  SEVEN_DAY_MS,
} from "./segments";

// renderWindow / colorPct は picocolors で着色するが、bun test の stdout は
// 非 TTY なので着色は無効化される。仮に着色されても数値部分は連続するため
// toContain で拾える。

describe("battery (残量ゲージ)", () => {
  // 着色 ANSI に █ は含まれないので塗りセル数は素朴に数えられる。
  const fills = (s: string) => (s.match(/█/g) || []).length;

  test("使用率が低いほど残量バーは満タンに近い", () => {
    expect(fills(battery(0))).toBe(5); // 残 100%
    expect(battery(0)).toContain("100%"); // 残量を表示
    expect(fills(battery(100))).toBe(0); // 残 0%（電池切れ）
    expect(battery(100)).toContain("0%");
  });

  test("使用 41% → 残 59% → 3セル塗り、数字は残量%", () => {
    const out = battery(41);
    expect(fills(out)).toBe(3); // round(0.59 * 5) = 3
    expect(out).toContain("59%"); // 残量を表示（使用率ではない）
    expect(out).not.toContain("41%");
    expect(out).toContain("["); // 枠
    expect(out).toContain("]");
  });

  test("0〜100 にクランプする", () => {
    expect(fills(battery(-10))).toBe(5);
    expect(fills(battery(150))).toBe(0);
  });
});

describe("ctxSegment", () => {
  test("stdin context_window.used_percentage を最優先で使う", async () => {
    const out = await ctxSegment({ context_window: { used_percentage: 5 } });
    expect(out).toContain("ctx");
    expect(out).toContain("95%"); // 使用 5% → 残 95%
  });

  test("used_percentage が null でも total_input_tokens + size で計算する", async () => {
    const out = await ctxSegment({
      context_window: {
        used_percentage: null,
        total_input_tokens: 300_000,
        context_window_size: 1_000_000,
      },
    });
    expect(out).toContain("70%"); // 使用 30% → 残 70%
  });

  test("context_window も transcript も無ければ空文字", async () => {
    const out = await ctxSegment({});
    expect(out).toBe("");
  });

  test("最終フォールバックは exceeds_200k_tokens", async () => {
    const out = await ctxSegment({ exceeds_200k_tokens: true });
    expect(out).toContain(">200k");
  });

  test("input が null なら空文字", async () => {
    const out = await ctxSegment(null);
    expect(out).toBe("");
  });
});

describe("fromStdinWindow", () => {
  test("resets_at(Unix epoch 秒) を ms に変換する", () => {
    const w = fromStdinWindow({ used_percentage: 42, resets_at: 1_700_000_000 });
    expect(w).toEqual({ utilization: 42, resetsAt: 1_700_000_000_000 });
  });

  test("used_percentage が無ければ null", () => {
    expect(fromStdinWindow({ resets_at: 1_700_000_000 })).toBeNull();
    expect(fromStdinWindow(null)).toBeNull();
    expect(fromStdinWindow(undefined)).toBeNull();
  });

  test("resets_at が無くても utilization は返す（resetsAt は null）", () => {
    expect(fromStdinWindow({ used_percentage: 10 })).toEqual({
      utilization: 10,
      resetsAt: null,
    });
  });
});

describe("freshFromCache", () => {
  const w = { utilization: 20, resetsAt: null };

  test("fetchedAt が新しければそのまま返す", () => {
    expect(freshFromCache(w, Date.now(), SEVEN_DAY_MS)).toBe(w);
  });

  test("fetchedAt が window 期間より古ければ null（死んだ 20% を捨てる）", () => {
    const old = Date.now() - SEVEN_DAY_MS - 1000;
    expect(freshFromCache(w, old, SEVEN_DAY_MS)).toBeNull();
  });

  test("fetchedAt が 0（不明）なら null", () => {
    expect(freshFromCache(w, 0, FIVE_HOUR_MS)).toBeNull();
  });

  test("window 自体が null なら null", () => {
    expect(freshFromCache(null, Date.now(), SEVEN_DAY_MS)).toBeNull();
  });
});

describe("five/seven-day segment: stdin rate_limits を優先", () => {
  test("five_hour を stdin から表示する（cache を読まない経路）", async () => {
    const future = Math.floor((Date.now() + 3 * 60 * 60 * 1000) / 1000);
    const out = await fiveHourSegment({
      rate_limits: { five_hour: { used_percentage: 24, resets_at: future } },
    });
    expect(out).toContain("5h");
    expect(out).toContain("76%"); // 使用 24% → 残 76%
  });

  test("seven_day を stdin から表示する", async () => {
    const future = Math.floor((Date.now() + 5 * 24 * 60 * 60 * 1000) / 1000);
    const out = await sevenDaySegment({
      rate_limits: { seven_day: { used_percentage: 41, resets_at: future } },
    });
    expect(out).toContain("7d");
    expect(out).toContain("59%"); // 使用 41% → 残 59%
  });
});
