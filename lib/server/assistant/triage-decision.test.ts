import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, type ToolContext } from "./execute-tool";

const { getProjectAccess, updateIssueFields, addCommentToIssue, issueRow } = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  updateIssueFields: vi.fn(),
  addCommentToIssue: vi.fn(),
  issueRow: { current: null as Record<string, unknown> | null },
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(), getProjectAccess,
}));
vi.mock("@/lib/server/update-issue", async (original) => ({
  ...await original<typeof import("@/lib/server/update-issue")>(), updateIssueFields,
}));
vi.mock("@/lib/server/add-comment", async (original) => ({
  ...await original<typeof import("@/lib/server/add-comment")>(), addCommentToIssue,
}));
vi.mock("@/lib/server/issue-store", async (original) => {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "is", "eq"]) query[method] = () => query;
  query.maybeSingle = async () => ({ data: issueRow.current, error: null });
  return {
    ...await original<typeof import("@/lib/server/issue-store")>(),
    issueStore: () => query,
  };
});

function context(): ToolContext {
  return {
    projectId: "project-1",
    userId: "user-1",
    supabase: {} as SupabaseClient,
    service: {} as SupabaseClient,
    locale: "en",
  };
}

const CONFLICT = {
  ok: false,
  status: 409,
  rawMessage: "The issue changed while this update was being prepared. Read it again and reapply the change.",
};

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccess.mockResolvedValue({ project: { id: "project-1", key: "MIN" }, isOwner: true, isMember: true, role: "owner", canWrite: true, canComment: true });
  issueRow.current = { id: "issue-1", status: "triage", updated_at: "2026-11-01T10:00:00Z" };
  updateIssueFields.mockResolvedValue({ ok: true });
  addCommentToIssue.mockResolvedValue({ ok: true });
});

describe("Numo triage_decision", () => {
  it("writes the decision against the triage snapshot it read", async () => {
    const result = await executeTool("triage_decision", {
      issue_id: "issue-1", decision: "accept", comment: "Looks valid.",
    }, context());
    expect(result).toEqual({
      success: true,
      result: { decision: "accept", issue_id: "issue-1", status: "backlog" },
    });
    expect(updateIssueFields).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "issue-1",
      input: { status: "backlog" },
      expectedUpdatedAt: "2026-11-01T10:00:00Z",
    }));
    expect(addCommentToIssue).toHaveBeenCalledWith(expect.objectContaining({ body: "Looks valid." }));
  });

  it("reports a concurrent decision as a conflict and posts no comment", async () => {
    updateIssueFields.mockResolvedValue(CONFLICT);
    const result = await executeTool("triage_decision", {
      issue_id: "issue-1", decision: "decline", comment: "Out of scope.",
    }, context());
    expect(result).toEqual({ success: false, result: { error: CONFLICT.rawMessage } });
    expect(addCommentToIssue).not.toHaveBeenCalled();
  });

  it("refuses an issue that already left triage without writing", async () => {
    issueRow.current = { id: "issue-1", status: "backlog", updated_at: "2026-11-01T10:00:00Z" };
    const result = await executeTool("triage_decision", { issue_id: "issue-1", decision: "accept" }, context());
    expect(result.success).toBe(false);
    expect(updateIssueFields).not.toHaveBeenCalled();
  });
});
