// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { holdScreenWakeLock } from "./screen-wake-lock";

class FakeSentinel extends EventTarget {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
    this.dispatchEvent(new Event("release"));
  });
}

let visibility: DocumentVisibilityState = "visible";
const sentinels: FakeSentinel[] = [];
const request = vi.fn(async () => {
  const sentinel = new FakeSentinel();
  sentinels.push(sentinel);
  return sentinel as unknown as WakeLockSentinel;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const setVisibility = (state: DocumentVisibilityState) => {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("holdScreenWakeLock", () => {
  beforeEach(() => {
    visibility = "visible";
    sentinels.length = 0;
    request.mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("holds a screen lock until released", async () => {
    const release = holdScreenWakeLock();
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    release();
    expect(sentinels[0].release).toHaveBeenCalledOnce();
  });

  it("asks again when the page shows after the browser dropped the lock", async () => {
    const release = holdScreenWakeLock();
    await flush();
    setVisibility("hidden");
    await sentinels[0].release();
    setVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    release();
    expect(sentinels[1].release).toHaveBeenCalledOnce();
  });

  it("lets go of a lock granted after the release", async () => {
    const release = holdScreenWakeLock();
    release();
    await flush();
    expect(sentinels[0].release).toHaveBeenCalledOnce();
  });

  it("does nothing where the API is missing", () => {
    Reflect.deleteProperty(navigator, "wakeLock");
    expect(() => holdScreenWakeLock()()).not.toThrow();
  });
});
