// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { dehydrate, focusManager, QueryClient, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppQueryProvider, clearPersistedQueryCache, QUERY_CACHE_STORAGE_KEY } from "./query-provider";
import { fetchProjectsApi } from "./projects-api";
import { useColdBoardPrefetch } from "./use-cold-board-prefetch";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
let root: Root;
const liveRead = vi.fn(fetchProjectsApi);
let result: { data: unknown; fetching: boolean };
function Consumer() {
  const query = useQuery({ queryKey: ["projects"], queryFn: liveRead, retry: false });
  result = { data: query.data, fetching: query.isFetching };
  return null;
}
function BoardRoute() {
  useColdBoardPrefetch(true);
  return null;
}
/** A sealed relaunch snapshot whose open request stays pending until finished. */
function sealedRelaunch(projectsUpdatedAt = Date.now() - 1_000) {
  const old = new QueryClient();
  old.setQueryData(["projects"], [{ id: "obsolete" }], { updatedAt: projectsUpdatedAt });
  const saved = { timestamp: Date.now(), buster: "v1", clientState: dehydrate(old) };
  old.clear();
  window.localStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify({
    format: "minddy-local-v1", expiresAt: Date.now() + 60_000, ciphertext: "sealed",
  }));
  const opened: { finish?: () => void; signal?: AbortSignal } = {};
  const seals: Array<{ value: { clientState: { queries: Array<{ state: { data: unknown } }> } } }> = [];
  const live: Array<() => void> = [];
  const fetch = vi.fn(async (path: string, init: RequestInit) => {
    if (path === "/api/me/local-snapshots") {
      const body = JSON.parse(String(init.body));
      if (body.operation === "seal") {
        seals.push(body);
        return Response.json({ snapshot: { format: "minddy-local-v1", owner: "owner", expiresAt: Date.now() + 60_000, ciphertext: "next" } });
      }
      opened.signal = init.signal ?? undefined;
      return new Promise<Response>(resolve => { opened.finish = () => resolve(Response.json({ value: saved })); });
    }
    return new Promise<Response>(resolve => { live.push(() => resolve(Response.json([{ id: "live" }]))); });
  });
  vi.stubGlobal("fetch", fetch);
  const paths = () => fetch.mock.calls.map(([path]) => String(path).split("?")[0]);
  return { opened, seals, live, paths };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  liveRead.mockClear();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(() => root.unmount());
  clearPersistedQueryCache();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("does not hold live reads behind a stalled encrypted restore and ignores its late response", async () => {
  const relaunch = sealedRelaunch();
  await act(() => root.render(createElement(AppQueryProvider, null, createElement(Consumer))));
  expect(relaunch.paths().sort()).toEqual(["/api/me/local-snapshots", "/api/projects"]);
  expect(liveRead).toHaveBeenCalledTimes(1);
  await act(async () => { relaunch.live.forEach((finish) => finish()); });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.data).toEqual([{ id: "live" }]);
  await act(() => vi.advanceTimersByTimeAsync(8_000));
  expect(relaunch.opened.signal?.aborted).toBe(true);
  await act(async () => { relaunch.opened.finish?.(); });
  expect(result.data).toEqual([{ id: "live" }]);
  expect(liveRead).toHaveBeenCalledTimes(1);
});

it("starts the cold board read while the sealed snapshot opens", async () => {
  const relaunch = sealedRelaunch();
  await act(() => root.render(createElement(AppQueryProvider, null, createElement(BoardRoute))));
  expect(relaunch.paths().sort()).toEqual(["/api/me/board", "/api/me/local-snapshots", "/api/me/views"]);
});

it("shows restored data during the one in-flight live read without repeating it", async () => {
  const relaunch = sealedRelaunch();
  await act(() => root.render(createElement(AppQueryProvider, null, createElement(Consumer))));
  expect(liveRead).toHaveBeenCalledTimes(1);
  await act(async () => { relaunch.opened.finish?.(); });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result).toEqual({ data: [{ id: "obsolete" }], fetching: true });
  await act(async () => { relaunch.live.forEach((finish) => finish()); });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result).toEqual({ data: [{ id: "live" }], fetching: false });
  expect(liveRead).toHaveBeenCalledTimes(1);
  expect(relaunch.paths().filter((path) => path === "/api/projects")).toHaveLength(1);
});

it("keeps and persists live data that completed before a clock-skewed restore", async () => {
  const relaunch = sealedRelaunch(Date.now() + 60_000);
  await act(() => root.render(createElement(AppQueryProvider, null, createElement(Consumer))));
  await act(async () => { relaunch.live.forEach((finish) => finish()); });
  await act(() => vi.advanceTimersByTimeAsync(1));
  await act(async () => { relaunch.opened.finish?.(); });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result).toEqual({ data: [{ id: "live" }], fetching: false });
  expect(liveRead).toHaveBeenCalledTimes(1);
  // The live entry is newer than the disk snapshot, so the save schedule seals it.
  await act(() => vi.advanceTimersByTimeAsync(6_000));
  expect(relaunch.seals.map((seal) => seal.value.clientState.queries.map((query) => query.state.data)))
    .toEqual([[[{ id: "live" }]]]);
});

it("retries a failed active query on focus without refreshing healthy cached data", async () => {
  focusManager.setFocused(true);
  let failing = true;
  const fetch = vi.fn(async () => {
    if (failing) throw new TypeError("Failed to fetch");
    return Response.json([{ id: "recovered" }]);
  });
  vi.stubGlobal("fetch", fetch);
  await act(() => root.render(createElement(AppQueryProvider, null, createElement(Consumer))));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.data).toBeUndefined();
  failing = false;
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.data).toEqual([{ id: "recovered" }]);
  expect(liveRead).toHaveBeenCalledTimes(2);
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
  expect(liveRead).toHaveBeenCalledTimes(2);
});
