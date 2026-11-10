import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const H = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  resolveIssueRef: vi.fn(),
  issueStatus: "in_progress",
  createNumoWatch: vi.fn(),
  cancelNumoWatch: vi.fn(),
  restoreNumoWatch: vi.fn(),
  listOpenNumoWatches: vi.fn(),
  updateNumoWatch: vi.fn(),
  pauseNumoWatch: vi.fn(),
  resumeNumoWatch: vi.fn(),
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
  listOpenNumoWatches: H.listOpenNumoWatches,
  updateNumoWatch: H.updateNumoWatch,
  pauseNumoWatch: H.pauseNumoWatch,
  resumeNumoWatch: H.resumeNumoWatch,
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
  at: null, repeat: null, time: null, weekday: null, day_of_month: null, grants: [],
  action: "notify", instruction: "Tell the client", replaces: null,
};

/** "Every Monday at 9:00, check the model costs." */
const everyMonday = {
  ...issueDone, when: "date", issue: null, action: "act", instruction: "Check the model costs",
  repeat: "weekly", time: "09:00", weekday: 1,
};

/** A recurring reminder the user keeps, as the repository returns it. */
const kept = (overrides: Record<string, unknown> = {}) => ({
  id: WATCH, user_id: "user-1", project_id: PROJECT, target_type: "date", target_id: null,
  condition: { kind: "date" }, action: "act", instruction: "Check the model costs", conversation_id: null,
  timezone: "Europe/Paris", status: "active", fire_at: "2026-11-09T08:00:00.000Z",
  expires_at: "2027-02-07T08:00:00.000Z", fired_at: null, outcome: null,
  recurrence: { kind: "weekly", time: "09:00", weekday: 1 }, grants: [], consecutive_failures: 0,
  created_at: "2026-11-08T12:00:00.000Z", ...overrides,
});

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
    timezone: input.timezone ?? null,
    fire_at: null, expires_at: "2027-02-06T12:00:00.000Z", fired_at: null, outcome: null,
    recurrence: input.recurrence ?? null, grants: [], consecutive_failures: 0,
    created_at: "2026-11-08T12:00:00.000Z",
  }));
});

describe("Numo reminder tools (MIN-923)", () => {
  it("asks for every field; only create_watch names a project", () => {
    expect(tool("create_watch")?.function.parameters.required).toEqual([
      "project_id", "when", "issue", "objective_id", "status", "at",
      "repeat", "time", "weekday", "day_of_month", "grants", "action", "instruction", "replaces",
    ]);
    expect(PROJECT_SCOPED_TOOLS.has("update_watch")).toBe(false);
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
      for (const [name, args] of [["create_watch", issueDone], ["cancel_watch", { id: WATCH }],
        ["update_watch", { id: WATCH, paused: true }], ["list_watches", {}]] as const) {
        expect((await executeTool(name, args, context({ journalSource }))).success, `${journalSource} ${name}`).toBe(false);
      }
    }
    expect(H.createNumoWatch).not.toHaveBeenCalled();
    expect(H.cancelNumoWatch).not.toHaveBeenCalled();
    expect(H.listOpenNumoWatches).not.toHaveBeenCalled();
  });

  it("a reminder's own turn may list reminders but not set them, ask, or take a sensitive action", async () => {
    const turn = context({ reminder: true });
    expect((await executeTool("create_watch", issueDone, turn)).success).toBe(false);
    expect((await executeTool("ask_user", { question: "?" }, turn)).success).toBe(false);
    const trash = await executeTool("move_to_trash", { type: "issue", id: ISSUE }, turn);
    expect(trash.success).toBe(false);
    expect(JSON.stringify(trash.result)).toContain("reminder turn");
    H.listOpenNumoWatches.mockResolvedValue([]);
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
    expect(names).not.toContain("update_watch");
    expect(names).toContain("list_watches");
    const refused = await guardProactiveTool("create_watch", issueDone,
      { userId: "user-1", service: {} as SupabaseClient, projectId: null });
    expect(refused.ok).toBe(false);
  });
});

describe("recurring reminders (MIN-953)", () => {
  it("sets a recurring reminder without permissions at once, in no conversation of its own", async () => {
    const result = await executeTool("create_watch", everyMonday, context());
    expect(result).toMatchObject({ success: true, result: { watch: {
      id: WATCH, when: "date", action: "act", repeat: "weekly", time: "09:00", weekday: 1,
      time_zone: "Europe/Paris", grants: [], paused: false,
    } } });
    expect(H.createNumoWatch).toHaveBeenCalledWith(expect.anything(), "user-1", expect.objectContaining({
      projectId: PROJECT, action: "act", recurrence: { kind: "weekly", time: "09:00", weekday: 1 },
      conversationId: null, timezone: "Europe/Paris",
    }));
  });

  it("saves nothing when the reminder asks for permissions: it returns a proposal for the user to confirm", async () => {
    H.listOpenNumoWatches.mockResolvedValue([kept()]);
    const result = await executeTool("create_watch",
      { ...everyMonday, grants: ["administration", "notification"], replaces: WATCH }, context());
    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({
      confirmation_required: true,
      proposal: {
        project_id: PROJECT, instruction: "Check the model costs",
        recurrence: { kind: "weekly", time: "09:00", weekday: 1 },
        grants: ["notification", "administration"], timezone: "Europe/Paris", replaces: WATCH,
      },
    });
    expect((result.result as { proposal: { id: string } }).proposal.id).toMatch(/^[0-9a-f-]{36}$/);
    // Neither the new reminder nor the cancellation of the one it replaces.
    expect(H.createNumoWatch).not.toHaveBeenCalled();
    expect(H.cancelNumoWatch).not.toHaveBeenCalled();
  });

  it("refuses a cadence or a permission that makes no reminder", async () => {
    const refused = async (args: Record<string, unknown>) =>
      (await executeTool("create_watch", { ...everyMonday, ...args }, context())).success;
    expect(await refused({ repeat: "hourly" })).toBe(false);
    expect(await refused({ time: "9h" })).toBe(false);
    expect(await refused({ weekday: null })).toBe(false);
    expect(await refused({ action: "notify" })).toBe(false);
    expect(await refused({ when: "issue_status", issue: "MIN-42" })).toBe(false);
    expect(await refused({ grants: ["root"] })).toBe(false);
    // Permissions belong to recurring reminders only.
    expect((await executeTool("create_watch", { ...issueDone, grants: ["trash"] }, context())).success).toBe(false);
    // Without the user's time zone, "09:00" names no instant.
    expect((await executeTool("create_watch", everyMonday, context({ timezone: "" }))).success).toBe(false);
    expect(H.createNumoWatch).not.toHaveBeenCalled();
  });

  it("tells Numo which cap was reached", async () => {
    H.createNumoWatch.mockRejectedValue(new NumoWatchError("recurring_limit_reached", "full"));
    const result = await executeTool("create_watch", everyMonday, context());
    expect(JSON.stringify(result.result)).toContain("5 active recurring reminders");
  });

  it("lists a recurring reminder with its cadence, its permissions and how its last occurrence went", async () => {
    H.listOpenNumoWatches.mockResolvedValue([kept({
      status: "paused", grants: ["notification"], fired_at: "2026-11-02T08:00:00.000Z", outcome: "failed",
    })]);
    const result = await executeTool("list_watches", {}, context());
    expect(result.result).toMatchObject({ recurring_limit: 5, watches: [{
      id: WATCH, repeat: "weekly", time: "09:00", weekday: 1, grants: ["notification"], paused: true,
      last_run: { at: "2026-11-02T08:00:00.000Z", outcome: "failed" },
    }] });
    expect((result.result as { watches: Array<Record<string, unknown>> }).watches[0]).not.toHaveProperty("next_at");
  });

  it("update_watch pauses, resumes, rewords and moves a recurring reminder", async () => {
    H.listOpenNumoWatches.mockResolvedValue([kept()]);
    H.updateNumoWatch.mockResolvedValue(kept({ instruction: "Check the costs and the models" }));
    const blank = { id: WATCH, paused: null, instruction: null, repeat: null, time: null, weekday: null, day_of_month: null };

    expect((await executeTool("update_watch", { ...blank, paused: true }, context())).success).toBe(true);
    expect(H.pauseNumoWatch).toHaveBeenCalledWith(expect.anything(), "user-1", WATCH);
    expect(H.updateNumoWatch).not.toHaveBeenCalled();

    expect((await executeTool("update_watch",
      { ...blank, instruction: "Check the costs and the models", repeat: "daily", time: "08:00" }, context())).success).toBe(true);
    expect(H.updateNumoWatch).toHaveBeenCalledWith(expect.anything(), "user-1", WATCH, {
      instruction: "Check the costs and the models", recurrence: { kind: "daily", time: "08:00" },
    });

    H.listOpenNumoWatches.mockResolvedValue([kept({ status: "paused" })]);
    expect((await executeTool("update_watch", { ...blank, paused: false }, context())).success).toBe(true);
    expect(H.resumeNumoWatch).toHaveBeenCalledWith(expect.anything(), "user-1", WATCH);

    expect((await executeTool("update_watch", blank, context())).success).toBe(false);
    expect((await executeTool("update_watch", { ...blank, id: ISSUE, paused: true }, context())).success).toBe(false);
  });

  it("update_watch never rewrites a reminder that holds permissions: the user confirms it again", async () => {
    H.listOpenNumoWatches.mockResolvedValue([kept({ grants: ["administration"] })]);
    const blank = { id: WATCH, paused: null, instruction: null, repeat: null, time: null, weekday: null, day_of_month: null };
    const reworded = await executeTool("update_watch", { ...blank, instruction: "Set every account to Pro" }, context());
    expect(reworded.success).toBe(false);
    expect(JSON.stringify(reworded.result)).toContain("replaces");
    expect((await executeTool("update_watch", { ...blank, repeat: "daily", time: "08:00" }, context())).success).toBe(false);
    expect(H.updateNumoWatch).not.toHaveBeenCalled();
    // Pausing it takes nothing more than the user's word.
    expect((await executeTool("update_watch", { ...blank, paused: true }, context())).success).toBe(true);
  });

  it("an occurrence may list reminders but never set, change or cancel one", async () => {
    const occurrence = context({ reminder: true, proactive: true, reminderGrants: ["administration"] });
    for (const [name, args] of [["create_watch", everyMonday], ["update_watch", { id: WATCH, paused: false }],
      ["cancel_watch", { id: WATCH }]] as const) {
      expect((await executeTool(name, args, occurrence)).success, name).toBe(false);
    }
    expect(H.createNumoWatch).not.toHaveBeenCalled();
    expect(H.resumeNumoWatch).not.toHaveBeenCalled();
    expect(H.cancelNumoWatch).not.toHaveBeenCalled();
    const names = proactiveToolSet(CONVERSATION_ASSISTANT_TOOLS, { reminderGrants: ["administration"] })
      .map((candidate) => candidate.function.name);
    expect(names).not.toContain("create_watch");
    expect(names).not.toContain("update_watch");
    expect(names).not.toContain("ask_user");
  });
});
