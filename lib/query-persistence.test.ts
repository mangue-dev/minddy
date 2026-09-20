import { QueryClient, type Query } from "@tanstack/react-query";
import { persistQueryClientRestore, type PersistedClient } from "@tanstack/react-query-persist-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleQuerySnapshot, subscribeToQueryPersistence } from "./query-persistence";
import { isPersistableKey } from "./query-provider";

const clients: QueryClient[] = [];
const stops: (() => void)[] = [];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const client of clients.splice(0)) client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function workspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  for (let project = 0; project < 6; project++) {
    client.setQueryData(["issues", `project-${project}`], Array.from({ length: 100 }, (_, issue) => ({
      id: `${project}-${issue}`,
      title: `Issue ${issue}`,
      description: "Daily work and implementation details. ".repeat(50),
    })));
  }
  const persistClient = vi.fn<(snapshot: PersistedClient) => void>();
  const persister = {
    persistClient,
    restoreClient: () => undefined,
    removeClient: () => {},
  };
  const shouldPersistQuery = (query: Query) =>
    query.state.status === "success" && isPersistableKey(query.queryKey);
  const persistence = subscribeToQueryPersistence({
    queryClient: client,
    persister,
    buster: "test",
    shouldPersistQuery,
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  });
  stops.push(persistence.stop);
  const scans = vi.spyOn(client.getQueryCache(), "getAll");
  return { client, persistClient, scans, persistence };
}

describe("workspace query persistence", () => {
  it("does no cache-wide work for excluded polling queries or fetch metadata", async () => {
    const { client, scans, persistClient } = workspace();
    for (let tick = 0; tick < 100; tick++) {
      client.setQueryData(["agent-active-issues", "all"], { tick });
      client.setQueryData(["page", "document"], { version: tick });
      client.setQueryData(["pull-requests", "all"], [{ tick }]);
    }
    const query = client.getQueryCache().find({ queryKey: ["issues", "project-0"] })!;
    scans.mockClear();
    query.setState({ fetchStatus: "fetching" });
    query.setState({ fetchStatus: "idle" });
    query.invalidate();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scans).not.toHaveBeenCalled();
    expect(persistClient).not.toHaveBeenCalled();
  });

  it("coalesces optimistic edits before dehydration and restores the latest snapshot", async () => {
    const { client, scans, persistClient } = workspace();
    for (let edit = 0; edit < 100; edit++) {
      client.setQueryData(["comments", "issue-1"], [{ text: `Edit ${edit}` }]);
    }
    expect(scans).not.toHaveBeenCalled();
    expect(persistClient).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(scans).toHaveBeenCalledTimes(1);
    expect(persistClient).toHaveBeenCalledTimes(1);

    const restored = new QueryClient();
    clients.push(restored);
    await persistQueryClientRestore({
      queryClient: restored,
      buster: "test",
      persister: {
        restoreClient: () => persistClient.mock.calls[0][0],
        persistClient: () => {},
        removeClient: () => {},
      },
    });
    expect(restored.getQueryData(["comments", "issue-1"])).toEqual([{ text: "Edit 99" }]);
    expect(restored.getQueryData<unknown[]>(["issues", "project-5"])).toHaveLength(100);
  });

  it("removes deleted and failed cached entries from the next snapshot", async () => {
    const { client, persistClient } = workspace();
    client.removeQueries({ queryKey: ["issues", "project-0"] });
    const query = client.getQueryCache().find({ queryKey: ["issues", "project-1"] })!;
    query.setState({ status: "error", error: new Error("Unavailable") });
    await vi.advanceTimersByTimeAsync(1_000);
    const keys = persistClient.mock.calls[0][0].clientState.queries.map((query) => query.queryKey);
    expect(keys).toHaveLength(4);
    expect(keys).not.toContainEqual(["issues", "project-0"]);
    expect(keys).not.toContainEqual(["issues", "project-1"]);
  });

  it("flushes pending changes once when leaving the document", () => {
    const { client, persistClient, persistence } = workspace();
    client.setQueryData(["comments", "issue-1"], [{ text: "Saved" }]);
    persistence.flush();
    persistence.flush();
    vi.advanceTimersByTime(2_000);
    expect(persistClient).toHaveBeenCalledTimes(1);
  });

  it("cancels pending writes and ignores later updates after logout or unmount", () => {
    const { client, persistClient, persistence } = workspace();
    client.setQueryData(["comments", "issue-1"], [{ text: "Private" }]);
    persistence.stop();
    persistence.flush();
    client.setQueryData(["comments", "issue-1"], [{ text: "Late response" }]);
    vi.advanceTimersByTime(2_000);
    expect(persistClient).not.toHaveBeenCalled();
  });

  it("contains storage failures without rejecting the originating edit", async () => {
    const { client, persistClient } = workspace();
    persistClient.mockImplementation(() => { throw new Error("Quota exceeded"); });
    client.setQueryData(["comments", "issue-1"], [{ text: "Still available" }]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(client.getQueryData(["comments", "issue-1"])).toEqual([{ text: "Still available" }]);
  });

  it("preserves paused mutations without snapshotting ordinary mutation events", async () => {
    const { client, persistClient } = workspace();
    const mutations = client.getMutationCache();
    mutations.build(client, { mutationKey: ["online-write"] });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(persistClient).not.toHaveBeenCalled();
    const paused = mutations.build(client, { mutationKey: ["offline-write"] }, {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: true,
      status: "pending",
      variables: { title: "Queued change" },
      submittedAt: Date.now(),
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(persistClient.mock.calls[0][0].clientState.mutations).toHaveLength(1);
    mutations.remove(paused);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(persistClient.mock.calls[1][0].clientState.mutations).toHaveLength(0);
  });
});

describe("query snapshot scheduling", () => {
  it("waits for an idle callback after the burst and bounds the idle wait", () => {
    const idle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    const save = vi.fn();
    scheduleQuerySnapshot(save);
    vi.advanceTimersByTime(1_000);
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 1_000 });
    expect(save).not.toHaveBeenCalled();
    idle.mock.calls[0][0]();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does not run an idle callback that arrives after cancellation", () => {
    const idle = vi.fn(() => 42);
    const cancelIdle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("cancelIdleCallback", cancelIdle);
    const save = vi.fn();
    const cancel = scheduleQuerySnapshot(save);
    vi.advanceTimersByTime(1_000);
    cancel();
    expect(cancelIdle).toHaveBeenCalledWith(42);
    (idle.mock.calls[0] as unknown as [() => void])[0]();
    expect(save).not.toHaveBeenCalled();
  });
});
