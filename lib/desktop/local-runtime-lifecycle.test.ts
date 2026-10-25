import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { createLocalRuntimeLifecycle } from "./local-runtime-lifecycle";

afterEach(() => vi.useRealTimers());
function setup() {
  const process = Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null as string | null });
  const healthy = vi.fn(async (_signal: AbortSignal): Promise<boolean> => false);
  const spawn = vi.fn(() => process);
  const stop = vi.fn();
  const lifecycle = createLocalRuntimeLifecycle({ healthy, spawn, stop, pollMs: 10, timeoutMs: 100 });
  return { lifecycle, process, healthy, spawn, stop };
}

it("shares concurrent startup calls until the owned server is actually ready", async () => {
  const { lifecycle, healthy, spawn } = setup();
  let ready!: (value: boolean) => void;
  healthy.mockResolvedValueOnce(false).mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
  const first = lifecycle.start("/clone");
  const second = lifecycle.start("/clone");
  expect(second).toBe(first);
  await Promise.resolve();
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(lifecycle.start("/clone")).toBe(first);
  ready(true);
  await expect(first).resolves.toBeUndefined();
  healthy.mockResolvedValueOnce(true);
  await expect(lifecycle.start("/clone")).resolves.toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
});

it("cancels before spawning and safely stops an attempt awaiting its health check", async () => {
  const first = setup();
  let resolve!: (value: boolean) => void;
  first.healthy.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const early = expect(first.lifecycle.start("/clone")).rejects.toMatchObject({ name: "AbortError" });
  first.lifecycle.stop(); resolve(false);
  await early;
  expect(first.spawn).not.toHaveBeenCalled();

  const second = setup();
  second.healthy.mockResolvedValueOnce(false).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const late = expect(second.lifecycle.start("/clone")).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  second.lifecycle.stop(); resolve(true);
  await late;
  expect(second.stop).toHaveBeenCalledExactlyOnceWith(second.process);
});

it("reports spawn failures and process exits without uncaught child errors", async () => {
  for (const failure of ["spawn", "exit"]) {
    const { lifecycle, healthy, process, stop } = setup();
    let resolve!: (value: boolean) => void;
    healthy.mockResolvedValueOnce(false).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = expect(lifecycle.start("/clone")).rejects.toThrow(failure === "spawn" ? "Missing shell" : "stopped with code 7");
    await Promise.resolve();
    if (failure === "spawn") process.emit("error", new Error("Missing shell"));
    else process.exitCode = 7;
    resolve(true);
    await pending;
    expect(stop).toHaveBeenCalledExactlyOnceWith(process);
    // Later teardown errors must remain handled after a failed launch.
    expect(() => process.emit("error", new Error("Already stopped"))).not.toThrow();
  }
});

it("keeps a canceled old attempt from stopping a replacement startup", async () => {
  const { lifecycle, healthy, spawn, stop, process } = setup();
  let resolve!: (value: boolean) => void;
  healthy.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const old = expect(lifecycle.start("/clone")).rejects.toMatchObject({ name: "AbortError" });
  lifecycle.stop();
  healthy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await expect(lifecycle.start("/clone")).resolves.toBeUndefined();
  resolve(false); await old;
  expect(spawn).toHaveBeenCalledTimes(1);
  expect(stop).not.toHaveBeenCalled();
  lifecycle.stop();
  expect(stop).toHaveBeenCalledExactlyOnceWith(process);
});

it("refuses externally owned servers and cleans up startup health timeouts", async () => {
  const external = setup();
  external.healthy.mockResolvedValueOnce(true);
  await expect(external.lifecycle.start("/clone")).rejects.toThrow("outside the desktop app");
  expect(external.spawn).not.toHaveBeenCalled();

  vi.useFakeTimers();
  const slow = setup();
  const pending = expect(slow.lifecycle.start("/clone")).rejects.toThrow("did not become ready");
  await vi.advanceTimersByTimeAsync(100);
  await pending;
  expect(slow.stop).toHaveBeenCalledExactlyOnceWith(slow.process);
});

it("reports signal termination during a health check without waiting for the startup timeout", async () => {
  const { lifecycle, healthy, process, stop } = setup();
  let resolve!: (value: boolean) => void;
  healthy.mockResolvedValueOnce(false).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = expect(lifecycle.start("/clone")).rejects.toThrow("stopped with signal SIGTERM");
  await Promise.resolve();
  process.signalCode = "SIGTERM";
  resolve(true);
  await pending;
  expect(stop).toHaveBeenCalledExactlyOnceWith(process);
});

it("spawns a replacement when a previously ready launcher has exited by signal", async () => {
  const { lifecycle, healthy, process, spawn } = setup();
  healthy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await lifecycle.start("/clone");
  process.signalCode = "SIGKILL";
  const replacement = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  spawn.mockReturnValueOnce(replacement);
  healthy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await expect(lifecycle.start("/clone")).resolves.toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(2);
});

it("rejects a different folder while startup is pending instead of sharing the wrong runtime", async () => {
  const { lifecycle, healthy, spawn } = setup();
  let resolve!: (value: boolean) => void;
  healthy.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValueOnce(true);
  const first = lifecycle.start("/clone-a");
  await expect(lifecycle.start("/clone-b")).rejects.toThrow("already starting from another folder");
  resolve(false);
  await first;
  expect(spawn).toHaveBeenCalledExactlyOnceWith("/clone-a");
});

it("waits for the previous launcher and port to stop before starting a different folder", async () => {
  vi.useFakeTimers();
  const { lifecycle, healthy, process, spawn, stop } = setup();
  healthy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await lifecycle.start("/clone-a");
  const replacement = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  spawn.mockReturnValueOnce(replacement);
  // The old server remains healthy briefly after it receives the stop request.
  healthy.mockResolvedValueOnce(true).mockResolvedValue(false);
  const next = lifecycle.start("/clone-b");
  await Promise.resolve();
  expect(stop).toHaveBeenCalledExactlyOnceWith(process);
  expect(spawn).toHaveBeenCalledTimes(1);
  process.signalCode = "SIGTERM";
  healthy.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await vi.advanceTimersByTimeAsync(10);
  await next;
  expect(spawn).toHaveBeenLastCalledWith("/clone-b");
});

it("does not start another folder while the stopped launcher's port remains occupied", async () => {
  vi.useFakeTimers();
  const { lifecycle, healthy, process, spawn } = setup();
  healthy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await lifecycle.start("/clone-a");
  healthy.mockResolvedValue(true);
  const next = expect(lifecycle.start("/clone-b")).rejects.toThrow("previous local minddy launcher did not stop");
  process.signalCode = "SIGTERM";
  await vi.advanceTimersByTimeAsync(30_000);
  await next;
  expect(spawn).toHaveBeenCalledTimes(1);
});

it("tells whether the launcher it started for a folder is still alive", async () => {
  const { lifecycle, healthy, process } = setup();
  expect(lifecycle.ownsLiveRuntime("/clone")).toBe(false);
  healthy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await lifecycle.start("/clone");
  expect(lifecycle.ownsLiveRuntime("/clone")).toBe(true);
  expect(lifecycle.ownsLiveRuntime("/other")).toBe(false);
  process.exitCode = 1;
  expect(lifecycle.ownsLiveRuntime("/clone")).toBe(false);
});
