import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  readIssue: vi.fn(), rpc: vi.fn(), broadcast: vi.fn(), syncStatus: vi.fn(),
}));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: mocks.readIssue };
    return query;
  },
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("./pr-live", () => ({ broadcastPrChanged: mocks.broadcast }));
vi.mock("./issue-status-sync", () => ({ syncIssueStatusFromPr: mocks.syncStatus }));

import { prUnlinkIssueResponse, type PrScope } from "./pr-actions";

const PR_ID = "62500000-0000-4000-8000-000000000030";
const ISSUE_ID = "62500000-0000-4000-8000-000000000020";
const scope = { pr: { id: PR_ID } } as PrScope;
const supabase = {} as SupabaseClient;
const unlink = (issueId: unknown = ISSUE_ID) => prUnlinkIssueResponse(scope, supabase, { issueId } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readIssue.mockResolvedValue({ data: { id: ISSUE_ID }, error: null });
  mocks.rpc.mockResolvedValue({ data: "unlinked", error: null });
});

describe("prUnlinkIssueResponse", () => {
  it("removes only the authorized association and never changes issue status", async () => {
    const response = await unlink();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("unlink_pull_request_from_issue_atomic", { p_pr_id: PR_ID, p_issue_id: ISSUE_ID });
    expect(mocks.broadcast).toHaveBeenCalledWith(PR_ID, ["pr"]);
    expect(mocks.syncStatus).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs before reading or writing", async () => {
    expect((await unlink("not-an-id")).status).toBe(400);
    expect(mocks.readIssue).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not write when issue RLS hides the issue", async () => {
    mocks.readIssue.mockResolvedValue({ data: null, error: null });
    expect((await unlink()).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps repeated removals idempotent", async () => {
    mocks.rpc.mockResolvedValue({ data: "already", error: null });
    expect((await unlink()).status).toBe(200);
  });
  it("reports a failed database write without a success broadcast", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Write failed" } });
    expect((await unlink()).status).toBe(500);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
  it("reports a PR deleted during the action", async () => {
    mocks.rpc.mockResolvedValue({ data: "pr_not_found", error: null });
    expect((await unlink()).status).toBe(404);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
});
