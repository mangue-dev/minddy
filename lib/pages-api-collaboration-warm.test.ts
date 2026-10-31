import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchClientRead = vi.fn();
vi.mock("./client-read", () => ({ fetchClientRead: (...args: unknown[]) => fetchClientRead(...args) }));

import { COLLABORATION_WARM_MS, fetchPageCollaborationApi, warmPageCollaboration } from "./pages-api";

const snapshot = (pageId: string) => ({ pageId, projectId: "p1", body: { revision: 1 }, title: { revision: 1, text: "" } });
const respond = (pageId: string) => new Response(JSON.stringify(snapshot(pageId)), { status: 200 });

describe("collaboration snapshot warming", () => {
  beforeEach(() => {
    fetchClientRead.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("adopts a warmed snapshot once, without a second request", async () => {
    fetchClientRead.mockImplementation(async () => respond("a"));
    warmPageCollaboration("p1", "a");
    warmPageCollaboration("p1", "a");
    expect(fetchClientRead).toHaveBeenCalledTimes(1);

    await expect(fetchPageCollaborationApi("p1", "a")).resolves.toMatchObject({ pageId: "a" });
    expect(fetchClientRead).toHaveBeenCalledTimes(1);

    // Consumed: the next open reads again rather than trusting an old snapshot.
    fetchClientRead.mockImplementation(async () => respond("a"));
    await fetchPageCollaborationApi("p1", "a");
    expect(fetchClientRead).toHaveBeenCalledTimes(2);
  });

  it("ignores a warmed snapshot older than the window", async () => {
    fetchClientRead.mockImplementation(async () => respond("b"));
    warmPageCollaboration("p1", "b");
    vi.advanceTimersByTime(COLLABORATION_WARM_MS + 1);
    await fetchPageCollaborationApi("p1", "b");
    expect(fetchClientRead).toHaveBeenCalledTimes(2);
  });

  it("falls back to a real read when the warm read failed", async () => {
    fetchClientRead.mockRejectedValueOnce(new Error("offline"));
    fetchClientRead.mockImplementation(async () => respond("c"));
    warmPageCollaboration("p1", "c");
    await expect(fetchPageCollaborationApi("p1", "c")).resolves.toMatchObject({ pageId: "c" });
    expect(fetchClientRead).toHaveBeenCalledTimes(2);
  });

  it("leaves the warmed snapshot to the read that replaces an aborted one", async () => {
    fetchClientRead.mockImplementation(async () => respond("d"));
    warmPageCollaboration("p1", "d");
    // The mount effect replays: its first read is aborted before the snapshot lands.
    const first = new AbortController();
    const aborted = fetchPageCollaborationApi("p1", "d", first.signal);
    first.abort();
    await expect(aborted).rejects.toThrow();
    await expect(fetchPageCollaborationApi("p1", "d")).resolves.toMatchObject({ pageId: "d" });
    expect(fetchClientRead).toHaveBeenCalledTimes(1);
  });
});
