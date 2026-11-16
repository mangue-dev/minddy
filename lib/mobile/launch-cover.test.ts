import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markFirstContent, resetFirstContentForTests } from "@/lib/first-content";
import { markPageContentShown, releaseLaunchCoverOnFirstContent, resetLaunchCoverForTests } from "./launch-cover";

function stubShell(shell: Record<string, unknown>) {
  vi.stubGlobal("window", {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { MinddyShell: shell } },
  });
}

/** A frame scheduler the test advances by hand. */
function manualFrames() {
  let queue: Array<() => void> = [];
  return {
    frame: (callback: () => void) => {
      queue.push(callback);
      return queue.length;
    },
    cancel: vi.fn(() => { queue = []; }),
    flush: () => {
      const pending = queue;
      queue = [];
      for (const callback of pending) callback();
    },
  };
}

beforeEach(() => {
  resetFirstContentForTests();
  resetLaunchCoverForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("releaseLaunchCoverOnFirstContent", () => {
  it("does nothing in a browser", () => {
    vi.stubGlobal("window", {});
    const frame = vi.fn(() => 1);
    releaseLaunchCoverOnFirstContent(frame, vi.fn());
    markFirstContent();
    expect(frame).not.toHaveBeenCalled();
  });

  it("waits for the first content, then two painted frames", () => {
    const contentShown = vi.fn(() => Promise.resolve());
    stubShell({ contentShown });
    const frames = manualFrames();
    releaseLaunchCoverOnFirstContent(frames.frame, frames.cancel);

    frames.flush();
    expect(contentShown).not.toHaveBeenCalled();

    markFirstContent();
    frames.flush();
    expect(contentShown).not.toHaveBeenCalled();
    frames.flush();
    expect(contentShown).toHaveBeenCalledTimes(1);
  });

  it("does not wait for the other startup reads once the page says it is shown", () => {
    const contentShown = vi.fn(() => Promise.resolve());
    stubShell({ contentShown });
    const frames = manualFrames();
    releaseLaunchCoverOnFirstContent(frames.frame, frames.cancel);
    markPageContentShown();
    frames.flush();
    frames.flush();
    expect(contentShown).toHaveBeenCalledTimes(1);
    // The first content, reached later, releases nothing more.
    markFirstContent();
    frames.flush();
    frames.flush();
    expect(contentShown).toHaveBeenCalledTimes(1);
  });

  it("releases at once per page, however many times it is mounted", () => {
    const contentShown = vi.fn(() => Promise.resolve());
    stubShell({ contentShown });
    const frames = manualFrames();
    markFirstContent();
    releaseLaunchCoverOnFirstContent(frames.frame, frames.cancel);
    releaseLaunchCoverOnFirstContent(frames.frame, frames.cancel);
    frames.flush();
    frames.flush();
    releaseLaunchCoverOnFirstContent(frames.frame, frames.cancel);
    frames.flush();
    frames.flush();
    expect(contentShown).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when cancelled", () => {
    const contentShown = vi.fn(() => Promise.resolve());
    stubShell({ contentShown });
    const frames = manualFrames();
    const cancel = releaseLaunchCoverOnFirstContent(frames.frame, frames.cancel);
    markFirstContent();
    cancel();
    frames.flush();
    frames.flush();
    expect(contentShown).not.toHaveBeenCalled();
  });

  it("leaves an older shell without contentShown alone", () => {
    stubShell({ haptic: vi.fn() });
    const frames = manualFrames();
    expect(() => {
      releaseLaunchCoverOnFirstContent(frames.frame, frames.cancel);
      markFirstContent();
      frames.flush();
      frames.flush();
    }).not.toThrow();
  });
});
