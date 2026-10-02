// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, dehydrate, useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppQueryProvider, clearPersistedQueryCache, QUERY_CACHE_STORAGE_KEY } from "./query-provider";
import { AccountQueryProvider } from "./account-query-provider";
import { projectIconQueryKey } from "./use-project-icon";
const account = vi.hoisted(() => ({ id: "account-a" }));
vi.mock("./auth-context", () => ({ useAuth: () => ({ user: { id: account.id } }) }));
vi.mock("./local-snapshots", () => ({
  invalidateLocalSnapshotWrites: vi.fn(),
  saveLocalSnapshot: async (storage: Storage, key: string, _slot: string, value: unknown) => {
    storage.setItem(key, JSON.stringify({ format: "minddy-local-v1", value }));
  },
  restoreLocalSnapshot: async (storage: Storage, key: string) => JSON.parse(storage.getItem(key) ?? "null")?.value,
}));

let root: Root;
let client: QueryClient;
const restoring: boolean[] = [];

function Consumer() {
  client = useQueryClient();
  restoring.push(useIsRestoring());
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  restoring.length = 0;
  account.id = "account-a";
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  client?.clear();
  clearPersistedQueryCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    root.render(createElement(StrictMode, null,
      createElement(AppQueryProvider, null, createElement(Consumer)),
    ));
  });
}

describe("query provider persistence lifecycle", () => {
  it("restarts persistence with an empty client after a direct account switch", async () => {
    const render = () => root.render(createElement(AccountQueryProvider, null, createElement(Consumer)));
    await act(async () => render());
    const departing = client;
    client.setQueryData(["projects"], [{ id: "private-a" }]);
    const iconKey = projectIconQueryKey("/api/projects/private-a/icon/content?v=1");
    client.setQueryData(iconKey, "data:image/webp;base64,cHJpdmF0ZQ==");
    clearPersistedQueryCache();
    expect(departing.getQueryData(iconKey)).toBeUndefined();
    account.id = "account-b";
    await act(async () => render());
    expect(client).not.toBe(departing);
    expect(client.getQueryData(["projects"])).toBeUndefined();
    expect(client.getQueryData(iconKey)).toBeUndefined();
    expect(restoring.at(-1)).toBe(false);
    client.setQueryData(["projects"], [{ id: "private-b" }]);
    window.dispatchEvent(new Event("pagehide"));
    const snapshot = JSON.parse(window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY)!).value;
    expect(snapshot.clientState.queries[0].state.data).toEqual([{ id: "private-b" }]);
  });

  it("restores and invalidates disk data once through Strict Mode effects", async () => {
    const previous = new QueryClient();
    previous.setQueryData(["projects"], [{ id: "saved-project" }], { updatedAt: Date.now() - 1_000 });
    window.localStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify({ format: "minddy-local-v1", value: {
      buster: "v1",
      timestamp: Date.now(),
      clientState: dehydrate(previous),
    } }));
    previous.clear();
    await mount();
    expect(restoring[0]).toBe(true);
    expect(restoring.at(-1)).toBe(false);
    expect(client.getQueryData(["projects"])).toEqual([{ id: "saved-project" }]);
    expect(client.getQueryState(["projects"])?.isInvalidated).toBe(true);
  });

  it("cannot rewrite the departing account's cache after explicit logout", async () => {
    await mount();
    client.setQueryData(["projects"], [{ id: "private-project" }]);
    clearPersistedQueryCache();
    expect(client.getQueryData(["projects"])).toBeUndefined();
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    client.setQueryData(["projects"], [{ id: "late-private-response" }]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
  });

  it("persists confirmed comments but never pending drafts or per-query search snippets", async () => {
    await mount();
    client.setQueryData(["comments", "issue-1"], [{ id: "pending", delivery: { state: "sending", retry: () => {} } }]);
    client.setQueryData(["page-comments", "page-1"], [{ id: "failed", delivery: { state: "error", retry: () => {} } }]);
    client.setQueryData(["me", "pages", "search", "text"], [{ id: "snippet" }]);
    client.setQueryData(["comments", "issue-2"], [{ id: "confirmed" }]);
    client.setQueryData(projectIconQueryKey("/api/projects/private/icon/content?v=1"), "data:image/webp;base64,cHJpdmF0ZQ==");
    window.dispatchEvent(new Event("pagehide"));
    const snapshot = JSON.parse(window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY)!).value;
    expect(snapshot.clientState.queries.map((query: { queryKey: string[] }) => query.queryKey))
      .toEqual([["comments", "issue-2"]]);
  });

  it("flushes the current snapshot when the document exits", async () => {
    await mount();
    client.setQueryData(["projects"], [{ id: "current-project" }]);
    window.dispatchEvent(new Event("pagehide"));
    const snapshot = JSON.parse(window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY)!).value;
    expect(snapshot.clientState.queries[0].state.data).toEqual([{ id: "current-project" }]);
  });
});
