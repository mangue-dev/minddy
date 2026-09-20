// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useColdBoardPrefetch } from "./use-cold-board-prefetch";
import { globalBoardQueryFn } from "./global-board-api";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import type { GlobalBoardResponse } from "./types";

const board: GlobalBoardResponse = { issues: [], members: {}, categories: {}, objectives: {},
  integrations: {}, relations: [], cycles: { enabled: false, current: null, upcoming: [], past: [] } };
const response = () => ({ ok: true, text: async () => JSON.stringify(board) });
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000 } } });

function Consumer() {
  const query = useQuery({ queryKey: GLOBAL_BOARD_KEY, queryFn: globalBoardQueryFn });
  return createElement("span", null, query.data ? "Ready" : "Pending");
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
  fetchMock = vi.fn(async () => response());
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
    expect(fetchMock.mock.calls.map(([url]) => String(url).split("?")[0])).toEqual(["/api/me/board", "/api/shell-fixture"]);
    expect(client.getQueryCache().find({ queryKey: GLOBAL_BOARD_KEY })?.getObserversCount()).toBe(0);
    await settle();
    expect(client.getQueryData(GLOBAL_BOARD_KEY)).toEqual(board);
  });

  it("waits for restoration and skips non-board routes and existing restored data", async () => {
    await render({ restoring: true });
    expect(fetchMock).not.toHaveBeenCalled();
    await render({ active: false });
    expect(fetchMock).not.toHaveBeenCalled();
    client.setQueryData(GLOBAL_BOARD_KEY, board, { updatedAt: 1 });
    await client.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY, refetchType: "none" });
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.isInvalidated).toBe(true);
  });

  it("joins the same in-flight read when the real board mounts", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render({ restoring: true });
    await render();
    await render({ consume: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { finish(response()); });
    await settle();
    expect(container.textContent).toBe("Ready");
    await render({ active: false });
    expect(client.getQueryCache().find({ queryKey: GLOBAL_BOARD_KEY })?.getObserversCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses query cancellation so a cleared account cache cannot receive a late response", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    let signal!: AbortSignal;
    fetchMock.mockImplementation((_url: string, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise((resolve) => { finish = resolve; });
    });
    await render();
    const previousClient = client;
    await act(() => previousClient.clear());
    expect(signal.aborted).toBe(true);
    client = makeClient();
    await render({ active: false });
    await act(async () => { finish(response()); });
    await settle();
    expect(previousClient.getQueryData(GLOBAL_BOARD_KEY)).toBeUndefined();
    expect(client.getQueryData(GLOBAL_BOARD_KEY)).toBeUndefined();
  });

  it("leaves normal mounted-query recovery available after a failed prefetch", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Unavailable"));
    await render();
    await settle();
    expect(client.getQueryState(GLOBAL_BOARD_KEY)?.status).toBe("error");
    await render({ consume: true });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("Ready");
  });
});
