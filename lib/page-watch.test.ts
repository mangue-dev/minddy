import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The LIFE CYCLE of the watch heartbeat (MIN-278 follow-up).
 *
 * Same proof as lib/page-presence.test.ts, same reason: a loop that survives
 * its component would keep the row fresh forever, and silence agent-write
 * notifications for a page nobody has open. The only way to catch it is to
 * mount, let the beats run, unmount, and look at what was sent.
 */

const H = vi.hoisted(() => ({
  pingPageWatchApi: vi.fn<(projectId: string, pageId: string) => void>(),
  clearPageWatchOnUnload:
    vi.fn<(projectId: string, pageId: string) => void>(),
}));

vi.mock("./pages-api", () => ({
  pingPageWatchApi: H.pingPageWatchApi,
  clearPageWatchOnUnload: H.clearPageWatchOnUnload,
}));

const { openPageWatch } = await import("./page-watch");

beforeEach(() => {
  vi.useFakeTimers();
  H.pingPageWatchApi.mockClear();
  H.clearPageWatchOnUnload.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("openPageWatch", () => {
  it("pings right away, then once per beat", () => {
    const handle = openPageWatch({ projectId: "proj", pageId: "page-1" });

    // Opening silences the line BEFORE any agent write can land, not after
    // the first interval.
    expect(H.pingPageWatchApi).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(H.pingPageWatchApi).toHaveBeenCalledTimes(4);
    handle.close();
  });

  it("stops on close and leaves at once rather than going stale", () => {
    const handle = openPageWatch({ projectId: "proj", pageId: "page-1" });
    vi.advanceTimersByTime(20_000);
    H.pingPageWatchApi.mockClear();

    handle.close();

    expect(H.clearPageWatchOnUnload).toHaveBeenCalledTimes(1);
    // No beat survives its component: closing kills the interval.
    vi.advanceTimersByTime(120_000);
    expect(H.pingPageWatchApi).not.toHaveBeenCalled();

    // React mounts and unmounts twice in development — close is idempotent.
    handle.close();
    expect(H.clearPageWatchOnUnload).toHaveBeenCalledTimes(1);
  });

  it("stays silent after close even when a timer was already scheduled", () => {
    const handle = openPageWatch({ projectId: "proj", pageId: "page-1" });
    handle.close();
    H.pingPageWatchApi.mockClear();
    H.clearPageWatchOnUnload.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(H.pingPageWatchApi).not.toHaveBeenCalled();
    expect(H.clearPageWatchOnUnload).not.toHaveBeenCalled();
  });
});
