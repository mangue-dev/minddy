import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { loadLocalRecoveryDocument } from "./local-recovery-load";

afterEach(() => vi.useRealTimers());
const local = "data:text/html,recovery";
function setup() {
  vi.useFakeTimers();
  let current = "https://minddy.example/stall";
  const target = Object.assign(new EventEmitter(), {
    getURL: () => current,
    loadURL: vi.fn((_url: string) => new Promise<void>(() => {})),
  });
  return { target, navigate: (url: string) => { current = url; } };
}

it("ignores a replaced stream's late abort and resolves only on the local document's completion", async () => {
  const { target, navigate } = setup();
  target.loadURL.mockRejectedValueOnce(Object.assign(new Error("Previous load aborted"), { errno: -3, url: "https://minddy.example/stall" }));
  const pending = loadLocalRecoveryDocument(target, local);
  target.emit("did-fail-load", {}, -3, "", "https://minddy.example/stall", true);
  await vi.advanceTimersByTimeAsync(1);
  navigate(local); target.emit("did-finish-load");
  await expect(pending).resolves.toBeUndefined();
  expect(target.eventNames()).toEqual([]);
});

it("reports a genuine local failure and removes its listeners", async () => {
  const { target } = setup();
  const pending = expect(loadLocalRecoveryDocument(target, local)).rejects.toThrow("failed (-2)");
  target.emit("did-fail-load", {}, -2, "Failure", local, true);
  await pending;
  expect(target.eventNames()).toEqual([]);
});

it("cancels on newer navigation, destruction or another crash", async () => {
  for (const event of ["did-start-navigation", "destroyed", "render-process-gone"]) {
    const { target } = setup();
    const pending = expect(loadLocalRecoveryDocument(target, local)).rejects.toThrow();
    target.emit(event, { url: "https://minddy.example/new", isMainFrame: true, isSameDocument: false });
    await pending;
    expect(target.eventNames()).toEqual([]);
  }
});

it("bounds an incomplete local load even when Electron's promise inherited an abort", async () => {
  const { target } = setup();
  target.loadURL.mockRejectedValueOnce(Object.assign(new Error("Previous load aborted"), { errno: -3, url: "https://minddy.example/stall" }));
  const pending = expect(loadLocalRecoveryDocument(target, local)).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15_000);
  await pending;
  expect(target.eventNames()).toEqual([]);
});

it("does not hide a synchronous or unrelated native load failure", async () => {
  const first = setup();
  first.target.loadURL.mockImplementationOnce(() => { throw new Error("Destroyed"); });
  await expect(loadLocalRecoveryDocument(first.target, local)).rejects.toThrow("Destroyed");
  expect(first.target.eventNames()).toEqual([]);
  const second = setup();
  second.target.loadURL.mockRejectedValueOnce(new Error("Native failure"));
  await expect(loadLocalRecoveryDocument(second.target, local)).rejects.toThrow("Native failure");
  expect(second.target.eventNames()).toEqual([]);
});
