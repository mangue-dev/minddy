import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareImport, prepareImportInSteps } from "@/lib/import/parse";
import { yieldToMain } from "@/lib/yield-to-main";

const CSV = "Title,Status,Priority\nFirst,Todo,High\nSecond,Done,Low\n";

describe("prepareImportInSteps", () => {
  it("returns what prepareImport returns, handing the thread back between steps", async () => {
    const pause = vi.fn(() => Promise.resolve());
    const stepped = await prepareImportInSteps(CSV, undefined, pause);
    expect(stepped).toEqual(prepareImport(CSV));
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it("stops before yielding when the file is empty", async () => {
    const pause = vi.fn(() => Promise.resolve());
    expect(await prepareImportInSteps("", undefined, pause)).toEqual({ ok: false, error: "empty" });
    expect(pause).not.toHaveBeenCalled();
  });
});

describe("yieldToMain", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses scheduler.yield when the browser has it", async () => {
    const yieldFn = vi.fn(() => Promise.resolve());
    vi.stubGlobal("scheduler", { yield: yieldFn });
    await yieldToMain();
    expect(yieldFn).toHaveBeenCalledOnce();
  });

  it("falls back to a zero-delay timeout", async () => {
    vi.stubGlobal("scheduler", undefined);
    vi.useFakeTimers();
    let done = false;
    const pending = yieldToMain().then(() => {
      done = true;
    });
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await pending;
    expect(done).toBe(true);
  });
});
