// @vitest-environment jsdom

import { act, createElement, memo } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchIssuePrs, IssuePrProvider, issuePrQueryKey, useIssuePr,
} from "@/components/issue-pr-context";
import { createIssuePrStore } from "./issue-pr-store";

const pr = { prId: "pr", prNumber: 42, state: "open" as const };
afterEach(() => vi.unstubAllGlobals());

describe("scoped issue pull request subscriptions", () => {
  it("updates one card among 600 and clears a removed pull request", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } } });
    const key = issuePrQueryKey("project");
    client.setQueryData(key, { pullRequests: {} });
    const renders = vi.fn();
    const states = new Map<string, unknown>();
    const Card = memo(({ id }: { id: string }) => {
      const value = useIssuePr(id);
      renders(id);
      states.set(id, value);
      return null;
    });
    const cards = Array.from({ length: 600 }, (_, index) => createElement(Card, { key: index, id: `issue-${index}` }));
    const root = createRoot(document.createElement("div"));
    const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };
    try {
      await act(() => root.render(createElement(QueryClientProvider, { client },
        createElement(IssuePrProvider, { projectId: "project", children: cards }))));
      expect(renders).toHaveBeenCalledTimes(600);
      await act(async () => { client.setQueryData(key, { pullRequests: { "issue-2": pr } }); await flush(); });
      expect(renders).toHaveBeenCalledTimes(601);
      expect(states.get("issue-2")).toEqual(pr);
      await act(async () => {
        client.setQueryData(key, { pullRequests: { "issue-2": { ...pr, prNumber: 43 } } });
        await flush();
      });
      expect(renders).toHaveBeenCalledTimes(602);
      expect(states.get("issue-2")).toMatchObject({ prNumber: 43 });
      await act(async () => { client.setQueryData(key, { pullRequests: {} }); await flush(); });
      expect(renders).toHaveBeenCalledTimes(603);
      expect(states.get("issue-2")).toBeNull();
    } finally { await act(() => root.unmount()); client.clear(); }
  });

  it("does not carry another project's pull requests into a new scope", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } } });
    client.setQueryData(issuePrQueryKey("first"), { pullRequests: { issue: pr } });
    client.setQueryData(issuePrQueryKey("second"), { pullRequests: {} });
    const values: unknown[] = [];
    function Card() { values.push(useIssuePr("issue")); return null; }
    const root = createRoot(document.createElement("div"));
    const render = (projectId: string) => root.render(createElement(QueryClientProvider, { client },
      createElement(IssuePrProvider, { projectId, children: createElement(Card) })));
    try {
      await act(() => render("first"));
      expect(values.at(-1)).toEqual(pr);
      values.length = 0;
      await act(() => render("second"));
      expect(values.length).toBeGreaterThan(0);
      expect(values.every((value) => value === null)).toBe(true);
    } finally { await act(() => root.unmount()); client.clear(); }
  });

  it("keeps unchanged snapshots stable and removes subscribers on unmount", () => {
    const store = createIssuePrStore({ pullRequests: { first: pr } });
    const first = store.get("first");
    const listener = vi.fn();
    const unsubscribe = store.subscribe("first", listener);
    store.update({ pullRequests: { first: { ...pr }, second: pr } });
    expect(store.get("first")).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    store.update();
    expect(listener).not.toHaveBeenCalled();
    expect(store.get("first")).toBeNull();
  });
});

describe("fetchIssuePrs", () => {
  it("throws on a failed response instead of reporting no pull request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(fetchIssuePrs("p1")).rejects.toThrow("issue-pull-requests 503");
  });

  it("scopes the global request to the board's sorted projects", async () => {
    const fetchMock = vi.fn(async (_url: string) => Response.json({ pullRequests: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchIssuePrs(null, ["p2", "p1"]);
    await fetchIssuePrs("p1");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/issue-pull-requests?projectId=p1&projectId=p2",
      "/api/projects/p1/issue-pull-requests",
    ]);
  });
});
