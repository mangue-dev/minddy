import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { observeRetainedBoardData } from "./retained-board-data";
import type { RetainedAppView } from "./retained-app-views";

const global: RetainedAppView = { key: "global", tabId: "g", kind: "global-board", route: { pathname: "/all", search: "", projectId: null } };
const project: RetainedAppView = { key: "project", tabId: "p", kind: "project-board", route: { pathname: "/projects/p", search: "", projectId: "p" } };

describe("retained board data ownership", () => {
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
