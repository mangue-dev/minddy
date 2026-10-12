import { expect, it, vi } from "vitest";
import type { DesktopChannel } from "./channel";
import { createDesktopChannelSwitch } from "./channel-switch";

function setup() {
  let channel: DesktopChannel = "stable";
  let blocked = false;
  let resolve!: () => void;
  const prepare = vi.fn(() => new Promise<void>(done => { resolve = done; }));
  const apply = vi.fn((next: DesktopChannel) => { channel = next; });
  const selection = createDesktopChannelSwitch({ current: () => channel,
    unavailable: () => blocked, prepare, apply });
  return { selection, prepare, apply, finish: () => resolve(), block: () => { blocked = true; } };
}

it("carries the session before applying the channel", async () => {
  const { selection, prepare, apply, finish } = setup();
  const pending = selection.select("preview");
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledExactlyOnceWith("preview"));
  expect(apply).not.toHaveBeenCalled();
  finish(); await pending;
  expect(apply).toHaveBeenCalledExactlyOnceWith("preview");
});

it("keeps a custom server or cloud selection made while cookies are being copied", async () => {
  const { selection, prepare, apply, finish } = setup();
  const pending = selection.select("preview");
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  selection.cancel();
  finish(); await pending;
  expect(apply).not.toHaveBeenCalled();
});

it("choosing the current channel cancels an unfinished switch away from it", async () => {
  const { selection, prepare, apply, finish } = setup();
  const pending = selection.select("preview");
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  await selection.select("stable");
  finish(); await pending;
  expect(apply).not.toHaveBeenCalled();
});

it("serializes repeated switches and applies only the latest selection", async () => {
  const { selection, prepare, apply, finish } = setup();
  const first = selection.select("preview");
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  const second = selection.select("preview");
  finish(); await first;
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
  expect(apply).not.toHaveBeenCalled();
  finish(); await second;
  expect(apply).toHaveBeenCalledExactlyOnceWith("preview");
});

it("does not apply a pending switch after quit or when a custom server blocks it", async () => {
  const { selection, prepare, apply, finish, block } = setup();
  const pending = selection.select("preview");
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
  block(); finish(); await pending;
  await selection.select("preview");
  expect(apply).not.toHaveBeenCalled();
  expect(prepare).toHaveBeenCalledTimes(1);
});

it("allows another selection after a preparation failure", async () => {
  const { selection, prepare, apply, finish } = setup();
  prepare.mockRejectedValueOnce(new Error("Cookie store unavailable"));
  await expect(selection.select("preview")).rejects.toThrow("Cookie store unavailable");
  const retry = selection.select("preview");
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
  finish(); await retry;
  expect(apply).toHaveBeenCalledExactlyOnceWith("preview");
});
