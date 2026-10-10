import { expect, it, vi } from "vitest";
import { createRendererRecovery, desktopRendererRecoveryHtml } from "./renderer-recovery";

function setup() {
  let origin = "https://minddy.example.com";
  let unavailable = false;
  const deferred: Array<() => void> = [];
  const load = vi.fn(async (_origin: string, _url: string) => {});
  const failed = vi.fn();
  const recovery = createRendererRecovery({
    origin: () => origin, unavailable: () => unavailable, load, failed,
    defer: (work) => { deferred.push(work); },
  });
  return { recovery, load, failed, run: () => deferred.splice(0).forEach(work => work()),
    changeOrigin: (value: string) => { origin = value; }, stop: () => { unavailable = true; } };
}

it("defers local recovery, remembers SPA routes and never reloads the remote document automatically", () => {
  const { recovery, load, run } = setup();
  recovery.navigationStarted("https://minddy.example.com/home", false);
  recovery.navigationStarted("https://minddy.example.com/projects/one?tab=issues", true);
  recovery.rendererGone("oom");
  expect(load).not.toHaveBeenCalled();
  run();
  expect(load).toHaveBeenCalledExactlyOnceWith("https://minddy.example.com", "https://minddy.example.com/projects/one?tab=issues");
});

it("stops recovery loops and permits a new attempt after explicit navigation", () => {
  const { recovery, load, failed, run } = setup();
  recovery.rendererGone("crashed"); run();
  recovery.navigationStarted("data:text/html,recovery", false);
  recovery.rendererGone("crashed"); run();
  recovery.rendererGone("crashed"); run();
  expect(load).toHaveBeenCalledTimes(1);
  expect(failed).toHaveBeenCalledTimes(1);
  recovery.navigationStarted("https://minddy.example.com/home", false);
  recovery.rendererGone("crashed"); run();
  expect(load).toHaveBeenCalledTimes(2);
});

it("ignores clean exits and cancels deferred work after quit, destruction or newer navigation", () => {
  const { recovery, load, run, stop } = setup();
  recovery.rendererGone("clean-exit"); run();
  expect(load).not.toHaveBeenCalled();
  recovery.rendererGone("crashed");
  recovery.navigationStarted("https://minddy.example.com/home", false);
  run();
  expect(load).not.toHaveBeenCalled();
  recovery.rendererGone("crashed"); stop(); run();
  expect(load).not.toHaveBeenCalled();
});

it("reports failed local loads once without an unhandled rejection", async () => {
  const { recovery, load, failed, run } = setup();
  load.mockRejectedValueOnce(new Error("Renderer unavailable"));
  recovery.rendererGone("launch-failed"); run();
  await Promise.resolve();
  expect(failed).toHaveBeenCalledTimes(1);
  recovery.rendererGone("launch-failed"); run();
  expect(failed).toHaveBeenCalledTimes(1);
});

it("handles synchronous load failures and ignores a late failure after navigation", async () => {
  const first = setup();
  first.load.mockImplementationOnce(() => { throw new Error("Window unavailable"); });
  first.recovery.rendererGone("crashed"); first.run();
  expect(first.failed).toHaveBeenCalledTimes(1);
  const second = setup();
  let reject!: (error: Error) => void;
  second.load.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  second.recovery.rendererGone("crashed"); second.run();
  second.recovery.navigationStarted("https://minddy.example.com/home", false);
  reject(new Error("Previous load canceled"));
  await Promise.resolve();
  expect(second.failed).not.toHaveBeenCalled();
});

it("keeps retries on the current server and escapes URL content", () => {
  const { recovery, load, changeOrigin, run } = setup();
  recovery.navigationStarted("https://minddy.example.com/projects/old", false);
  changeOrigin("https://new.example.com");
  recovery.rendererGone("crashed"); run();
  const html = desktopRendererRecoveryHtml(load.mock.calls[0][0], load.mock.calls[0][1]);
  expect(html).toContain('href="https://new.example.com/home"');
  expect(html).toContain("Reload window");
  expect(html).toContain("Unsaved changes may be lost");
  expect(html).not.toContain("projects/old");
  expect(html).not.toContain("location.reload");
  const escaped = desktopRendererRecoveryHtml("https://minddy.example.com", 'https://minddy.example.com/home?x="<script>');
  expect(escaped).not.toContain('x="<script>');
  expect(escaped).toContain("x=%22%3Cscript%3E");
});
