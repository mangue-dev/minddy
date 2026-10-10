// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { dehydrate, focusManager, QueryClient, useIsRestoring, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppQueryProvider, clearPersistedQueryCache, QUERY_CACHE_STORAGE_KEY } from "./query-provider";
import { fetchProjectsApi } from "./projects-api";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
let root: Root;
const liveRead = vi.fn(fetchProjectsApi);
let result: { restoring: boolean; data: unknown };
function Consumer() {
  const query = useQuery({ queryKey: ["projects"], queryFn: liveRead, retry: false });
  result = { restoring: useIsRestoring(), data: query.data };
  return null;
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

it("releases live reads after a stalled encrypted restore and ignores its late response", async () => {
  const old = new QueryClient();
  old.setQueryData(["projects"], [{ id: "obsolete" }], { updatedAt: Date.now() - 1_000 });
  const saved = { timestamp: Date.now(), buster: "v1", clientState: dehydrate(old) };
  old.clear();
  window.localStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify({
    format: "minddy-local-v1", expiresAt: Date.now() + 60_000, ciphertext: "sealed",
  }));
  let finishRestore!: (value: Response) => void;
  let restoreSignal!: AbortSignal;
  const fetch = vi.fn(async (path, init) => {
    if (path === "/api/me/local-snapshots") {
      restoreSignal = init.signal;
      return new Promise<Response>(resolve => { finishRestore = resolve; });
    }
    return Response.json([{ id: "live" }]);
  });
  vi.stubGlobal("fetch", fetch);
  await act(() => root.render(createElement(AppQueryProvider, null, createElement(Consumer))));
  expect(result.restoring).toBe(true);
  expect(liveRead).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(8_000));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(restoreSignal.aborted).toBe(true);
  expect(result).toEqual({ restoring: false, data: [{ id: "live" }] });
  expect(liveRead).toHaveBeenCalledTimes(1);
  await act(async () => { finishRestore(Response.json({ value: saved })); });
  expect(result.data).toEqual([{ id: "live" }]);
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
