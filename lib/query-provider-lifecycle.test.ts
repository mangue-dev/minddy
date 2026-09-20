// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, dehydrate, useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppQueryProvider, clearPersistedQueryCache, QUERY_CACHE_STORAGE_KEY } from "./query-provider";

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
  it("restores and invalidates disk data once through Strict Mode effects", async () => {
    const previous = new QueryClient();
    previous.setQueryData(["projects"], [{ id: "saved-project" }], { updatedAt: Date.now() - 1_000 });
    window.localStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify({
      buster: "v1",
      timestamp: Date.now(),
      clientState: dehydrate(previous),
    }));
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
    window.dispatchEvent(new Event("pagehide"));
    client.setQueryData(["projects"], [{ id: "late-private-response" }]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
  });

  it("flushes the current snapshot when the document exits", async () => {
    await mount();
    client.setQueryData(["projects"], [{ id: "current-project" }]);
    window.dispatchEvent(new Event("pagehide"));
    const snapshot = JSON.parse(window.localStorage.getItem(QUERY_CACHE_STORAGE_KEY)!);
    expect(snapshot.clientState.queries[0].state.data).toEqual([{ id: "current-project" }]);
  });
});
