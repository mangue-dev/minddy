import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agentActivityQueryKey,
  fetchAgentActivity,
} from "@/components/agent/agent-activity-context";

/**
 * Activity poll drives agent halos on maps. A
 * network error should not become "no agent working": this would be a
 * display lie, and triggering a card teardown (MIN-301).
 *
 * Tested on a `QueryObserver` — the same engine as `useQuery`, without React (the
 * suite runs on bare node).
 */

const okResponse = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload }) as Response;
const errorResponse = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAgentActivity", () => {
  it("throws on a failed response instead of returning empty lists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse(503)));
    await expect(fetchAgentActivity("p1")).rejects.toThrow("agent-activity 503");
  });

  it("comble les champs absents d'une réponse partielle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse({ workingIssueIds: ["i1"] })),
    );
    await expect(fetchAgentActivity("p1")).resolves.toEqual({
      workingIssueIds: ["i1"],
      sessionIssueIds: [],
      pullRequests: {},
    });
  });

  it("queries the global route without a project, and the project route otherwise", async () => {
    const fetchMock = vi.fn(async (_url: string) => okResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await fetchAgentActivity(null, ["p2", "p1"]);
    await fetchAgentActivity("p1");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/agent-activity?projectId=p1&projectId=p2",
      "/api/projects/p1/agent-runs",
    ]);
  });
});

describe("the poll keeps its last known state", () => {
  it("preserves workingIssueIds when the next poll fails", async () => {
    let failing = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        failing
          ? errorResponse(500)
          : okResponse({ workingIssueIds: ["i1"], sessionIssueIds: ["i1"] }),
      ),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const observer = new QueryObserver(client, {
      queryKey: agentActivityQueryKey("p1"),
      queryFn: () => fetchAgentActivity("p1"),
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => {});

    await observer.refetch();
    expect(observer.getCurrentResult().data?.workingIssueIds).toEqual(["i1"]);

    failing = true;
    await observer.refetch();

    const result = observer.getCurrentResult();
    expect(result.isError).toBe(true);
    // The point of the ticket: halos don't go out.
    expect(result.data?.workingIssueIds).toEqual(["i1"]);

    unsubscribe();
    client.clear();
  });
});

describe("agentActivityQueryKey", () => {
  it("distinguishes global mode from project mode", () => {
    expect(agentActivityQueryKey(null)).toEqual([
      "agent-active-issues",
      "__global__",
      "",
    ]);
    expect(agentActivityQueryKey("p1")).toEqual(["agent-active-issues", "p1"]);
  });

  it("includes the authorized global project scope in the cache key", () => {
    expect(agentActivityQueryKey(null, ["p2", "p1"])).toEqual([
      "agent-active-issues",
      "__global__",
      "p1,p2",
    ]);
  });
});
