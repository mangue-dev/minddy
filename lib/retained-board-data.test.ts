import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createRetainedBoardData, observeRetainedBoardData } from "./retained-board-data";
import type { RetainedAppView } from "./retained-app-views";

const global: RetainedAppView = { key: "global", tabId: "g", kind: "global-board", route: { pathname: "/all", search: "", projectSegment: null } };
const project: RetainedAppView = { key: "project", tabId: "p", kind: "project-board", route: { pathname: "/projects/p", search: "", projectSegment: "p" } };

describe("retained board data ownership", () => {
  it("keeps loaded Pages and Feedback lists current without starting hidden PR polling", async () => {
    const client = new QueryClient();
    const read = vi.fn(async () => ["fresh"]);
    for (const key of [["pages", "p"], ["feedback", "p"], ["pull-request", "pr"]]) await client.fetchQuery({ queryKey: key, queryFn: read });
    read.mockClear();
    const stop = observeRetainedBoardData(client, [
      { ...project, kind: "pages" }, { ...project, kind: "feedback" }, { ...global, kind: "pull-requests" },
    ]);
    await client.invalidateQueries();
    expect(read).toHaveBeenCalledTimes(2);
    stop(); await client.invalidateQueries(); expect(read).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it("keeps loaded hidden data current once through the shared query and releases it on eviction", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300000 } } });
    const read = vi.fn(async () => ({ issues: [{ title: "Changed remotely" }] }));
    await client.fetchQuery({ queryKey: ["me", "board"], queryFn: read });
    read.mockClear();
    const stop = observeRetainedBoardData(client, [global]);
    expect(read).not.toHaveBeenCalled();
    await client.invalidateQueries({ queryKey: ["me", "board"] });
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["me", "board"])).toEqual({ issues: [{ title: "Changed remotely" }] });
    stop();
    await client.invalidateQueries({ queryKey: ["me", "board"] });
    expect(read).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("does not prefetch absent data, observe timelines or subscribe to unrelated projects", async () => {
    const client = new QueryClient();
    const read = vi.fn(async () => []);
    for (const key of [["issues", "p"], ["issues", "other"], ["comments", "p"]]) {
      await client.fetchQuery({ queryKey: key, queryFn: read });
    }
    read.mockClear();
    const stop = observeRetainedBoardData(client, [global, project]);
    expect(client.getQueryCache().find({ queryKey: ["me", "board"] })).toBeUndefined();
    await client.invalidateQueries({ queryKey: ["comments"] });
    await client.invalidateQueries({ queryKey: ["issues", "other"] });
    expect(read).not.toHaveBeenCalled();
    await client.invalidateQueries({ queryKey: ["issues", "p"] });
    expect(read).toHaveBeenCalledTimes(1);
    stop(); client.clear();
  });

  it("keeps observers through reordered views and attaches new scopes before releasing old ones", async () => {
    const client = new QueryClient();
    let finish!: (value: string[]) => void;
    const aborted = vi.fn();
    client.setQueryDefaults(["issues", "p"], { queryFn: ({ signal }) => new Promise<string[]>((resolve) => {
      signal.addEventListener("abort", aborted);
      finish = resolve;
    }) });
    client.setQueryDefaults(["issues", "q"], { queryFn: async () => ["q"] });
    client.setQueryData(["issues", "p"], ["old"]);
    client.setQueryData(["issues", "q"], ["q"]);
    const observers = (id: string) => client.getQueryCache().find({ queryKey: ["issues", id] })!.getObserversCount();
    const other: RetainedAppView = { ...project, key: "other", tabId: "q", route: { pathname: "/projects/q", search: "", projectSegment: "q" } };
    const data = createRetainedBoardData(client);
    data.update([global, project]);
    const read = client.invalidateQueries({ queryKey: ["issues", "p"] });
    data.update([project, global]);
    data.update([{ ...project, route: { ...project.route } }, other]);
    expect(aborted).not.toHaveBeenCalled();
    expect(observers("p")).toBe(1);
    expect(observers("q")).toBe(1);
    finish(["fresh"]); await read;
    expect(client.getQueryData(["issues", "p"])).toEqual(["fresh"]);
    data.update([other]);
    expect(observers("p")).toBe(0);
    expect(observers("q")).toBe(1);
    data.dispose();
    expect(observers("q")).toBe(0);
    client.clear();
  });

  it("shares pending reads and forgets removed data on account cleanup", async () => {
    const client = new QueryClient();
    let finish!: (value: string[]) => void;
    const read = vi.fn(() => new Promise<string[]>((resolve) => { finish = resolve; }));
    client.setQueryDefaults(["issues", "p"], { queryFn: read });
    client.setQueryData(["issues", "p"], ["old"]);
    const stop = observeRetainedBoardData(client, [project]);
    const first = client.invalidateQueries({ queryKey: ["issues", "p"] });
    const second = client.refetchQueries({ queryKey: ["issues", "p"] }, { cancelRefetch: false });
    expect(read).toHaveBeenCalledTimes(1);
    finish(["fresh"]); await Promise.all([first, second]);
    client.clear();
    expect(client.getQueryData(["issues", "p"])).toBeUndefined();
    stop();
  });
});
