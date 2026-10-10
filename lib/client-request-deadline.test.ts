import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withClientRequestDeadline } from "./client-request-deadline";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "any").mockImplementation(() => { throw new Error("Unsupported API"); });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("completes without AbortSignal.any and removes caller listeners", async () => {
  const caller = new AbortController();
  const add = vi.spyOn(caller.signal, "addEventListener");
  const remove = vi.spyOn(caller.signal, "removeEventListener");
  await expect(withClientRequestDeadline(async () => "ready", 30_000, caller.signal)).resolves.toBe("ready");
  expect(AbortSignal.any).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
  expect(vi.getTimerCount()).toBe(0);
});

it("forwards caller cancellation and its reason without leaving listeners", async () => {
  const caller = new AbortController();
  const remove = vi.spyOn(caller.signal, "removeEventListener");
  let transport!: AbortSignal;
  const pending = withClientRequestDeadline(signal => {
    transport = signal;
    return new Promise(() => {});
  }, 30_000, caller.signal);
  const reason = new Error("Caller cancelled");
  caller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(transport.reason).toBe(reason);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("never starts work for a pre-aborted caller", async () => {
  const caller = new AbortController();
  caller.abort();
  const work = vi.fn();
  await expect(withClientRequestDeadline(work, 30_000, caller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(work).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("times out the transport and cleans up even without AbortSignal.any", async () => {
  const caller = new AbortController();
  const remove = vi.spyOn(caller.signal, "removeEventListener");
  let transport!: AbortSignal;
  const pending = withClientRequestDeadline(signal => {
    transport = signal;
    return new Promise(() => {});
  }, 30_000, caller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(transport.aborted).toBe(true);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps cancellation available when no transfer deadline is configured", async () => {
  const caller = new AbortController();
  const pending = withClientRequestDeadline(() => new Promise(() => {}), null, caller.signal);
  await vi.advanceTimersByTimeAsync(90_000);
  expect(vi.getTimerCount()).toBe(0);
  caller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("cleans up after work rejects", async () => {
  const caller = new AbortController();
  const remove = vi.spyOn(caller.signal, "removeEventListener");
  const error = new Error("Read failed");
  await expect(withClientRequestDeadline(async () => { throw error; }, 30_000, caller.signal)).rejects.toBe(error);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
