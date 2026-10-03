import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { retainedBoardReadState } from "./retained-board-read-state";
import type { RetainedAppView } from "./retained-app-views";
const view: RetainedAppView = { key: "g", tabId: "g", kind: "global-board", route: { pathname: "/all", search: "", projectId: null } };

it("labels previous board rows while invalidated, fetching, paused or failed", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me", "board"], { issues: ["previous"] });
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
