import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { refreshRetainedBoard, retainedBoardKeys, retainedBoardReadState } from "./retained-board-read-state";
import type { RetainedAppView } from "./retained-app-views";
const view: RetainedAppView = { key: "g", tabId: "g", kind: "global-board", route: { pathname: "/all", search: "", projectId: null } };

it.each([view, { ...view, kind: "project-board" as const, route: { pathname: "/projects/p", projectId: "p", search: "" } }])("waits for every prerequisite of a $kind, including absent queries", (board) => {
  const client = new QueryClient();
  expect(retainedBoardReadState(client, board)).toBe("loading");
  for (const key of retainedBoardKeys(board).slice(0, -1)) client.setQueryData(key, []);
  expect(retainedBoardReadState(client, board)).toBe("loading");
  client.setQueryData(retainedBoardKeys(board).at(-1)!, []);
  expect(retainedBoardReadState(client, board)).toBe("fresh");
  client.clear();
});

it("refreshes expired retained rows on activation without introducing a live expiry timer", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000 } } });
  try {
    for (const key of retainedBoardKeys(view)) await client.fetchQuery({ queryKey: key, queryFn: async () => [] });
    expect(retainedBoardReadState(client, view)).toBe("fresh");
    now.mockReturnValue(302_000);
    const refresh = refreshRetainedBoard(client, view);
    expect(retainedBoardReadState(client, view)).toBe("refreshing");
    await refresh;
    expect(retainedBoardReadState(client, view)).toBe("fresh");
  } finally { now.mockRestore(); client.clear(); }
});

it("reuses fresh caches and joins pending activation reads without cancelling them", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000 } } });
  const read = vi.fn(async () => []);
  try {
    for (const key of retainedBoardKeys(view)) await client.fetchQuery({ queryKey: key, queryFn: read });
    read.mockClear();
    await refreshRetainedBoard(client, view);
    expect(read).not.toHaveBeenCalled();
    let finish!: (rows: string[]) => void;
    const pendingRead = vi.fn(() => new Promise<string[]>((resolve) => { finish = resolve; }));
    const first = client.fetchQuery({ queryKey: ["me", "board"], queryFn: pendingRead, staleTime: 0 });
    await client.invalidateQueries({ queryKey: ["me", "board"], refetchType: "none" });
    const second = refreshRetainedBoard(client, view);
    expect(pendingRead).toHaveBeenCalledTimes(1);
    finish(["Current rows"]);
    await Promise.all([first, second]);
    expect(retainedBoardReadState(client, view)).toBe("fresh");
    expect(client.getQueryData(["me", "board"])).toEqual(["Current rows"]);
  } finally { client.clear(); }
});

it("waits for invalidated or pending board reads and exposes paused or failed reads", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me", "board"], { issues: ["previous"] });
  client.setQueryData(["views", "global"], []);
  client.setQueryData(["projects"], []);
  expect(retainedBoardReadState(client, view)).toBe("fresh");
  await client.invalidateQueries({ queryKey: ["me", "board"], refetchType: "none" });
  expect(retainedBoardReadState(client, view)).toBe("refreshing");
  let finish!: (data: unknown) => void;
  const pending = client.fetchQuery({ queryKey: ["me", "board"], queryFn: () => new Promise((resolve) => { finish = resolve; }) });
  expect(retainedBoardReadState(client, view)).toBe("refreshing");
  finish({ issues: ["exact"] }); await pending;
  expect(retainedBoardReadState(client, view)).toBe("fresh");
  await client.fetchQuery({ queryKey: ["me", "board"], queryFn: () => { throw new Error("Authorization failed"); } }).catch(() => {});
  expect(retainedBoardReadState(client, view)).toBe("error");
  expect(client.getQueryData(["me", "board"])).toEqual({ issues: ["exact"] });
  client.getQueryCache().find({ queryKey: ["me", "board"] })!.setState({ fetchStatus: "paused" });
  expect(retainedBoardReadState(client, view)).toBe("paused");
  client.clear();
});
