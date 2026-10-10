import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchIssueAutomationApi, fetchIssueChainStatusApi } from "./agent-api";
import { issueChainQueryKey, issueChainStatusQueryKey } from "./use-agent-runs";
import { keysForProjectEvent } from "./realtime-keys";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));

afterEach(() => vi.unstubAllGlobals());
describe("issue chain status query", () => {
  it("keeps full simulation consumers on their existing endpoint", async () => {
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify({ chain: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await fetchIssueChainStatusApi("issue-1");
    await fetchIssueAutomationApi("issue-1");
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "/api/issues/issue-1/automation?view=chain", "/api/issues/issue-1/automation",
    ]);
  });
  it("invalidates status and simulation on realtime updates without touching another issue", async () => {
    const client = new QueryClient();
    const status = issueChainStatusQueryKey("issue-1"), full = issueChainQueryKey("issue-1"), other = issueChainStatusQueryKey("issue-2");
    for (const key of [status, full, other]) client.setQueryData(key, { chain: null });
    const invalidations = keysForProjectEvent({ table: "agent_chains", operation: "UPDATE", schema: "public", record: { issue_id: "issue-1" }, old_record: {} }, "project-1");
    for (const { key } of invalidations) await client.invalidateQueries({ queryKey: key, refetchType: "none" });
    expect(client.getQueryState(status)?.isInvalidated).toBe(true);
    expect(client.getQueryState(full)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    client.clear();
  });
});
