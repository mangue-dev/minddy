// @vitest-environment jsdom

import { act, createElement, memo } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentActivityProvider, agentActivityQueryKey, useIssueActivity,
} from "@/components/agent/agent-activity-context";
import { createAgentActivityStore } from "./agent-activity-store";

const empty = { workingIssueIds: [], sessionIssueIds: [], sessionConversations: {}, pullRequests: {} };
afterEach(() => vi.unstubAllGlobals());

describe("scoped agent activity subscriptions", () => {
  it("updates one card among 600, preserves PR metadata, and clears removed state", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } } });
    const key = agentActivityQueryKey("project");
    client.setQueryData(key, empty);
    const renders = vi.fn();
    const states = new Map<string, unknown>();
    const Card = memo(({ id }: { id: string }) => {
      const value = useIssueActivity(id);
      renders(id);
      states.set(id, value);
      return null;
    });
    const cards = Array.from({ length: 600 }, (_, index) => createElement(Card, { key: index, id: `issue-${index}` }));
    const root = createRoot(document.createElement("div"));
    const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };
    try {
      await act(() => root.render(createElement(QueryClientProvider, { client },
        createElement(AgentActivityProvider, { projectId: "project", children: cards }))));
      expect(renders).toHaveBeenCalledTimes(600);
      const payload = { workingIssueIds: ["issue-2"], sessionIssueIds: ["issue-2"],
        sessionConversations: { "issue-2": "conversation" },
        pullRequests: { "issue-2": { prId: "pr", prNumber: 42, state: "open" } } };
      await act(async () => { client.setQueryData(key, payload); await flush(); });
      expect(renders).toHaveBeenCalledTimes(601);
      expect(states.get("issue-2")).toEqual({ working: true, session: true,
        conversation: "conversation", pr: payload.pullRequests["issue-2"] });
      await act(async () => {
        client.setQueryData(key, { ...payload, pullRequests: { "issue-2": { ...payload.pullRequests["issue-2"], prNumber: 43 } } });
        await flush();
      });
      expect(renders).toHaveBeenCalledTimes(602);
      expect(states.get("issue-2")).toMatchObject({ pr: { prNumber: 43 } });
      await act(async () => { client.setQueryData(key, empty); await flush(); });
      expect(renders).toHaveBeenCalledTimes(603);
      expect(states.get("issue-2")).toEqual({ working: false, session: false, conversation: null, pr: null });
    } finally { await act(() => root.unmount()); client.clear(); }
  });

  it("does not carry another project's activity into a new scope", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } } });
    client.setQueryData(agentActivityQueryKey("first"), { ...empty, workingIssueIds: ["issue"] });
    client.setQueryData(agentActivityQueryKey("second"), empty);
    const values: boolean[] = [];
    function Card() { values.push(useIssueActivity("issue").working); return null; }
    const root = createRoot(document.createElement("div"));
    const render = (projectId: string) => root.render(createElement(QueryClientProvider, { client },
      createElement(AgentActivityProvider, { projectId, children: createElement(Card) })));
    try {
      await act(() => render("first"));
      expect(values.at(-1)).toBe(true);
      values.length = 0;
      await act(() => render("second"));
      expect(values.length).toBeGreaterThan(0);
      expect(values.every((value) => value === false)).toBe(true);
    } finally { await act(() => root.unmount()); client.clear(); }
  });

  it("keeps unchanged snapshots stable and removes subscribers on unmount", () => {
    const store = createAgentActivityStore({ workingIssueIds: ["first"] });
    const first = store.get("first");
    const listener = vi.fn();
    const unsubscribe = store.subscribe("first", listener);
    store.update({ workingIssueIds: ["first", "second"] });
    expect(store.get("first")).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    store.update();
    expect(listener).not.toHaveBeenCalled();
    expect(store.get("first").working).toBe(false);
  });
});
