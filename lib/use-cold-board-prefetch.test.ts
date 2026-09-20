// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useColdBoardPrefetch } from "./use-cold-board-prefetch";
import { globalBoardQueryFn } from "./global-board-api";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import { useViewsQuery } from "./use-views-query";
import type { GlobalBoardResponse } from "./types";

const board: GlobalBoardResponse = { issues: [], members: {}, categories: {}, objectives: {},
  integrations: {}, relations: [], cycles: { enabled: false, current: null, upcoming: [], past: [] } };
const viewsKey = ["views", "global"];
const response = (data: unknown = board) => ({ ok: true, text: async () => JSON.stringify(data) });
const responseFor = (url: string) => response(url.split("?")[0] === "/api/me/views" ? [] : board);
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000 } } });

function Consumer() {
  const query = useQuery({ queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn });
  const views = useViewsQuery({ kind: "global" });
  return createElement("span", null, query.data && !views.loading ? "Ready" : "Pending");
}
function Host({ active, consume }: { active: boolean; consume: boolean }) {
  useColdBoardPrefetch(active);
  return consume ? createElement(Consumer) : null;
}
function Shell({ active, consume }: { active: boolean; consume: boolean }) {
  useEffect(() => { void fetch("/api/shell-fixture"); }, []);
  return createElement(Host, { active, consume });
}
async function render({ active = true, restoring = false, consume = false, shell = false } = {}) {
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(IsRestoringProvider, { value: restoring }, createElement(shell ? Shell : Host, { active, consume })))));
}
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = makeClient();
  fetchMock = vi.fn(async (url: string) => responseFor(url));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("cold retained-board request scheduling", () => {
  it("starts before parent shell reads without waiting for the lazy screen or adding an observer", async () => {
    await render({ shell: true });
    expect(fetchMock.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual(["/api/me/board", "/api/me/views", "/api/shell-fixture"]);
    expect(client.getQueryCache().find({ queryKey: GLOBAL_BOARD_KEY })?.getObserversCount()).toBe(0);
    expect(client.getQueryCache().find({ queryKey: viewsKey })?.getObserversCount()).toBe(0);
    await settle();
    expect(client.getQueryData(GLOBAL_BOARD_KEY)).toEqual(board);
    expect(client.getQueryData(viewsKey)).toEqual([]);
  });

  it("waits for restoration and skips non-board routes and existing restored data", async () => {
    await render({ restoring: true });
    expect(fetchMock).not.toHaveBeenCalled();
    await render({ active: false });
    expect(fetchMock).not.toHaveBeenCalled();
    client.setQueryData(GLOBAL_BOARD_KEY, board, { updatedAt: 1 });
    client.setQueryData(viewsKey, [], { updatedAt: 1 });
    await client.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY, refetchType: "none" });
    await client.invalidateQueries({ queryKey: viewsKey, refetchType: "none" });
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(viewsKey)?.isInvalidated).toBe(true);
  });

  it.each([
    { cachedKey: GLOBAL_BOARD_KEY, cachedData: board, requestedPath: "/api/me/views" },
    { cachedKey: viewsKey, cachedData: [], requestedPath: "/api/me/board" },
  ])("independently skips cached data while requesting $requestedPath", async ({ cachedKey, cachedData, requestedPath }) => {
    client.setQueryData(cachedKey, cachedData);
    await render();
    await settle();
    expect(fetchMock.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual([requestedPath]);
  });

  it("joins both in-flight reads when the real board and saved-views hooks mount", async () => {
    const finishes: Array<() => void> = [];
    fetchMock.mockImplementation((url: string) => new Promise((resolve) => { finishes.push(() => resolve(responseFor(url))); }));
    await render({ restoring: true });
    await render();
    await render({ consume: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { finishes.forEach((finish) => finish()); });
    await settle();
    expect(container.textContent).toBe("Ready");
    await render({ active: false });
    expect(client.getQueryCache().find({ queryKey: GLOBAL_BOARD_KEY })?.getObserversCount()).toBe(0);
    expect(client.getQueryCache().find({ queryKey: viewsKey })?.getObserversCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses query cancellation so a cleared account cache cannot receive a late response", async () => {
    const finishes: Array<() => void> = [];
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((url: string, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return new Promise((resolve) => { finishes.push(() => resolve(responseFor(url))); });
    });
    await render();
    const previousClient = client;
    await act(() => previousClient.clear());
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    client = makeClient();
    await render({ active: false });
    await act(async () => { finishes.forEach((finish) => finish()); });
    await settle();
    expect(previousClient.getQueryData(GLOBAL_BOARD_KEY)).toBeUndefined();
    expect(client.getQueryData(GLOBAL_BOARD_KEY)).toBeUndefined();
    expect(previousClient.getQueryData(viewsKey)).toBeUndefined();
    expect(client.getQueryData(viewsKey)).toBeUndefined();
  });

  it("leaves normal mounted-query recovery available after a failed prefetch", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Unavailable"));
    await render();
    await settle();
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.status).toBe("error");
    await render({ consume: true });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toBe("Ready");
  });
});
