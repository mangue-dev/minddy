import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const H = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  resolveIssueRef: vi.fn(),
  issueStatus: "in_progress",
  createNumoWatch: vi.fn(),
  cancelNumoWatch: vi.fn(),
  restoreNumoWatch: vi.fn(),
  listActiveNumoWatches: vi.fn(),
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(),
  getProjectAccess: H.getProjectAccess,
}));
vi.mock("@/lib/server/issue-reads", async (original) => ({
  ...await original<typeof import("@/lib/server/issue-reads")>(),
  resolveIssueRef: H.resolveIssueRef,
}));
vi.mock("@/lib/server/issue-store", async (original) => ({
  ...await original<typeof import("@/lib/server/issue-store")>(),
  issueStore: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { status: H.issueStatus }, error: null }),
    };
    return chain;
  },
}));
vi.mock("@/lib/server/numo/watches", async (original) => ({
  ...await original<typeof import("@/lib/server/numo/watches")>(),
  createNumoWatch: H.createNumoWatch,
  cancelNumoWatch: H.cancelNumoWatch,
  restoreNumoWatch: H.restoreNumoWatch,
  listActiveNumoWatches: H.listActiveNumoWatches,
}));

import { executeTool, type ToolContext } from "./execute-tool";
import { CONVERSATION_ASSISTANT_TOOLS, PROJECT_SCOPED_TOOLS } from "./tools";
import { guardProactiveTool, proactiveToolSet } from "./proactive-guard";
import { NumoWatchError } from "@/lib/server/numo/watches";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ISSUE = "22222222-2222-4222-8222-222222222222";
const WATCH = "33333333-3333-4333-8333-333333333333";

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectId: null,
    requireExplicitProjectTarget: true,
    userId: "user-1",
    supabase: {} as SupabaseClient,
    service: {} as SupabaseClient,
    locale: "en",
    conversationId: "conversation-1",
    journalSource: "conversation",
    timezone: "Europe/Paris",
    ...overrides,
  };
}

const tool = (name: string) =>
  CONVERSATION_ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name);

const issueDone = {
  project_id: PROJECT, when: "issue_status", issue: "MIN-42", objective_id: null, status: null,
  at: null, action: "notify", instruction: "Tell the client", replaces: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  H.issueStatus = "in_progress";
  H.getProjectAccess.mockResolvedValue({
    project: { id: PROJECT, key: "MIN" }, role: "reader", isOwner: false, canWrite: false, canComment: false,
  });
  H.resolveIssueRef.mockResolvedValue({ issue: { id: ISSUE, number: 42, identifier: "MIN-42" } });
  H.createNumoWatch.mockImplementation(async (_service, userId, input) => ({
    id: WATCH, user_id: userId, project_id: input.projectId, target_type: input.target.type,
    target_id: input.target.id, condition: input.target.condition, action: input.action,
    instruction: input.instruction, conversation_id: input.conversationId, status: "active",
    fire_at: null, expires_at: "2027-02-06T12:00:00.000Z", fired_at: null, outcome: null,
    created_at: "2026-11-08T12:00:00.000Z",
  }));
});

describe("Numo reminder tools (MIN-923)", () => {
  it("asks for every field; only create_watch names a project", () => {
    expect(tool("create_watch")?.function.parameters.required).toEqual([
      "project_id", "when", "issue", "objective_id", "status", "at", "action", "instruction", "replaces",
    ]);
    expect(PROJECT_SCOPED_TOOLS.has("create_watch")).toBe(true);
    expect(PROJECT_SCOPED_TOOLS.has("list_watches")).toBe(false);
    expect(PROJECT_SCOPED_TOOLS.has("cancel_watch")).toBe(false);
  });

  it("sets a reminder on an issue, waiting for done, from this conversation; a Reader may", async () => {
    const result = await executeTool("create_watch", issueDone, context());
    expect(result).toMatchObject({ success: true, result: { watch: {
      id: WATCH, when: "issue_status", issue_id: ISSUE, status: "done", action: "notify",
    } } });
    expect(H.createNumoWatch).toHaveBeenCalledWith(expect.anything(), "user-1", expect.objectContaining({
      projectId: PROJECT,
      target: { type: "issue", id: ISSUE, condition: { kind: "status", status: "done" } },
      conversationId: "conversation-1",
      timezone: "Europe/Paris",
    }));
  });

  it("refuses to wait for a status the issue already has", async () => {
    H.issueStatus = "done";
    const result = await executeTool("create_watch", issueDone, context());
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.result)).toContain("already done");
    expect(H.createNumoWatch).not.toHaveBeenCalled();
  });

  it("cancels the reminder it replaces, and refuses an unknown one", async () => {
    H.cancelNumoWatch.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await executeTool("create_watch", { ...issueDone, replaces: WATCH }, context())).success).toBe(true);
    expect(H.cancelNumoWatch).toHaveBeenCalledWith(expect.anything(), "user-1", WATCH);
    expect((await executeTool("create_watch", { ...issueDone, replaces: WATCH }, context())).success).toBe(false);
    expect(H.createNumoWatch).toHaveBeenCalledTimes(1);
  });

  it("keeps the replaced reminder when the replacement is refused", async () => {
    const past = { ...issueDone, when: "date", issue: null, at: "2026-01-01T09:00:00+01:00", replaces: WATCH };
    expect((await executeTool("create_watch", past, context())).success).toBe(false);
    expect(H.cancelNumoWatch).not.toHaveBeenCalled();

    // A failure after the cancellation puts the old reminder back.
    H.cancelNumoWatch.mockResolvedValueOnce(true);
    H.createNumoWatch.mockRejectedValueOnce(new NumoWatchError("database", "down"));
    expect((await executeTool("create_watch", { ...issueDone, replaces: WATCH }, context())).success).toBe(false);
    expect(H.restoreNumoWatch).toHaveBeenCalledWith(expect.anything(), "user-1", WATCH);
  });

  it("refuses a date without its offset", async () => {
    const result = await executeTool("create_watch",
      { ...issueDone, when: "date", issue: null, at: "2026-11-13T09:00:00" }, context());
    expect(result.success).toBe(false);
    expect(H.createNumoWatch).not.toHaveBeenCalled();
  });

  it("is refused to a routine and a mention, which do not list reminders either", async () => {
    for (const journalSource of ["routine", "mention"] as const) {
      for (const [name, args] of [["create_watch", issueDone], ["cancel_watch", { id: WATCH }], ["list_watches", {}]] as const) {
        expect((await executeTool(name, args, context({ journalSource }))).success, `${journalSource} ${name}`).toBe(false);
      }
    }
    expect(H.createNumoWatch).not.toHaveBeenCalled();
    expect(H.cancelNumoWatch).not.toHaveBeenCalled();
    expect(H.listActiveNumoWatches).not.toHaveBeenCalled();
  });

  it("a reminder's own turn may list reminders but not set them, ask, or take a sensitive action", async () => {
    const turn = context({ reminder: true });
    expect((await executeTool("create_watch", issueDone, turn)).success).toBe(false);
    expect((await executeTool("ask_user", { question: "?" }, turn)).success).toBe(false);
    const trash = await executeTool("move_to_trash", { type: "issue", id: ISSUE }, turn);
    expect(trash.success).toBe(false);
    expect(JSON.stringify(trash.result)).toContain("reminder turn");
    H.listActiveNumoWatches.mockResolvedValue([]);
    expect((await executeTool("list_watches", {}, turn)).success).toBe(true);
  });

  it("asks the user which reminder to drop when the limit is reached", async () => {
    H.createNumoWatch.mockRejectedValue(new NumoWatchError("limit_reached", "full"));
    const result = await executeTool("create_watch", issueDone, context());
    expect(JSON.stringify(result.result)).toContain("Ask them which one to cancel");
  });

  it("is not offered to a background turn, and refused there", async () => {
    const names = proactiveToolSet(CONVERSATION_ASSISTANT_TOOLS).map((candidate) => candidate.function.name);
    expect(names).not.toContain("create_watch");
    expect(names).not.toContain("cancel_watch");
    expect(names).toContain("list_watches");
    const refused = await guardProactiveTool("create_watch", issueDone,
      { userId: "user-1", service: {} as SupabaseClient, projectId: null });
    expect(refused.ok).toBe(false);
  });
});
