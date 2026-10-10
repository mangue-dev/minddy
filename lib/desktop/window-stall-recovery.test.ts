import { afterEach, expect, it, vi } from "vitest";
import { createWindowStallRecovery, DESKTOP_HANG_GRACE_MS, DESKTOP_LOAD_DEADLINE_MS } from "./window-stall-recovery";

afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  let stopped = false;
  const prompt = vi.fn(async (_reason: string, _signal: AbortSignal) => false);
  const recover = vi.fn();
  const controller = createWindowStallRecovery({ origin: () => "https://minddy.example", unavailable: () => stopped, prompt, recover });
  return { controller, prompt, recover, stop: () => { stopped = true; controller.stop(); } };
}

it("offers one load recovery after the deadline, preserves SPA navigation, and never recovers on Wait", async () => {
  const { controller, prompt, recover } = setup();
  controller.navigationStarted("https://minddy.example/home", false);
  await vi.advanceTimersByTimeAsync(20_000);
  controller.navigationStarted("https://minddy.example/home?tab=one", true);
  await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS - 20_000);
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(prompt.mock.calls[0][0]).toBe("loading");
  await vi.advanceTimersByTimeAsync(90_000);
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(recover).not.toHaveBeenCalled();
  prompt.mockResolvedValueOnce(true);
  controller.navigationStarted("https://minddy.example/projects/one", false);
  await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS);
  expect(recover).toHaveBeenCalledExactlyOnceWith("loading");
  controller.stop();
});

it("cancels completed loads and obsolete dialogs on new remote or local documents", async () => {
  const { controller, prompt, recover } = setup();
  controller.navigationStarted("https://minddy.example/home", false);
  controller.loadingStopped();
  await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS);
  expect(prompt).not.toHaveBeenCalled();
  let resolve!: (recover: boolean) => void;
  prompt.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  controller.navigationStarted("https://minddy.example/home", false);
  await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS);
  const signal = prompt.mock.calls[0][1];
  controller.navigationStarted("data:text/html,recovery", false);
  expect(signal.aborted).toBe(true);
  resolve(true); await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS);
  expect(recover).not.toHaveBeenCalled();
  expect(prompt).toHaveBeenCalledTimes(1);
  controller.stop();
});

it("ignores transient hangs and cancels recovery when the renderer becomes responsive", async () => {
  const { controller, prompt, recover } = setup();
  controller.unresponsive(); controller.responsive();
  await vi.advanceTimersByTimeAsync(DESKTOP_HANG_GRACE_MS);
  expect(prompt).not.toHaveBeenCalled();
  let resolve!: (recover: boolean) => void;
  prompt.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  controller.unresponsive();
  await vi.advanceTimersByTimeAsync(DESKTOP_HANG_GRACE_MS);
  const signal = prompt.mock.calls[0][1];
  controller.responsive();
  expect(signal.aborted).toBe(true);
  resolve(true); await vi.advanceTimersByTimeAsync(1);
  expect(recover).not.toHaveBeenCalled();
  prompt.mockResolvedValueOnce(true);
  controller.unresponsive();
  await vi.advanceTimersByTimeAsync(DESKTOP_HANG_GRACE_MS);
  expect(recover).toHaveBeenCalledExactlyOnceWith("unresponsive");
  controller.stop();
});

it("never stacks prompts or repeats them after Wait while a hang continues", async () => {
  const { controller, prompt, recover } = setup();
  let resolve!: (recover: boolean) => void;
  prompt.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  controller.navigationStarted("https://minddy.example/home", false);
  await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS);
  controller.unresponsive();
  await vi.advanceTimersByTimeAsync(DESKTOP_HANG_GRACE_MS);
  expect(prompt).toHaveBeenCalledTimes(1);
  resolve(false); await vi.advanceTimersByTimeAsync(DESKTOP_HANG_GRACE_MS);
  expect(prompt.mock.calls.map(([reason]) => reason)).toEqual(["loading", "unresponsive"]);
  controller.unresponsive();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(prompt).toHaveBeenCalledTimes(2);
  expect(recover).not.toHaveBeenCalled();
  controller.stop();
});

it("resumes load monitoring after a transient hang and ignores prompt failures or quitting", async () => {
  const { controller, prompt, recover, stop } = setup();
  controller.navigationStarted("https://minddy.example/home", false);
  controller.unresponsive();
  await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS);
  expect(prompt.mock.calls.map(([reason]) => reason)).toEqual(["unresponsive"]);
  controller.responsive(); prompt.mockRejectedValueOnce(new Error("Native dialog failed"));
  await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS);
  expect(prompt).toHaveBeenCalledTimes(2);
  expect(recover).not.toHaveBeenCalled();
  controller.navigationStarted("https://minddy.example/home", false);
  stop(); await vi.advanceTimersByTimeAsync(DESKTOP_LOAD_DEADLINE_MS);
  expect(prompt).toHaveBeenCalledTimes(2);
});
