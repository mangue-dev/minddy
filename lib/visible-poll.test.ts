// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisiblePoll } from "./visible-poll";

let visibility: DocumentVisibilityState;
let stop: (() => void) | undefined;
function show(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("visible snapshot polling", () => {
  it("avoids 120 scheduled reads over a hidden minute and catches up immediately", async () => {
    const read = vi.fn(async () => {});
    stop = startVisiblePoll(read, 500);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(121);
    show("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(121);
    show("visible");
    expect(read).toHaveBeenCalledTimes(122);
    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalledTimes(123);
  });

  it("starts hidden without reading and removes visibility listeners on stop", async () => {
    show("hidden");
    const read = vi.fn(async () => {});
    stop = startVisiblePoll(read, 500);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).not.toHaveBeenCalled();
    show("visible");
    expect(read).toHaveBeenCalledTimes(1);
    stop();
    show("hidden");
    show("visible");
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("cancels hidden work without overlapping reads on a rapid return", async () => {
    let finish!: () => void;
    const read = vi.fn((_signal: AbortSignal) => new Promise<void>(resolve => { finish = resolve; }));
    stop = startVisiblePoll(read, 500);
    const firstSignal = read.mock.calls[0][0];
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(1);
    show("hidden");
    expect(firstSignal.aborted).toBe(true);
    show("visible");
    expect(read).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    const secondSignal = read.mock.calls[1][0];
    expect(secondSignal.aborted).toBe(false);
    stop();
    expect(secondSignal.aborted).toBe(true);
    finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("retries a rejected read and does not resume while still hidden", async () => {
    let reject!: (error: Error) => void;
    const read = vi.fn< (signal: AbortSignal) => Promise<void> >()
      .mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }))
      .mockResolvedValue(undefined);
    stop = startVisiblePoll(read, 500);
    reject(new Error("Network unavailable"));
    await vi.advanceTimersByTimeAsync(500);
    expect(read).toHaveBeenCalledTimes(2);
    show("hidden");
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(2);
    show("visible");
    expect(read).toHaveBeenCalledTimes(3);
  });
});
