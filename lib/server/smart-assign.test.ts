import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE BRANCH (MIN-564) — `runSmartAssign` through the decision layer.
 *
 * The two engine adapters are doubles, exactly like `runner.test.ts` mocks
 * them: what is pinned here is the AGREEMENT — the spec carries the team
 * (names, owner mark, rules) and the real member ids; a confident decision model
 * decides alone; the decision model down or unsure replays the `choose_assignee` LLM pass;
 * both failing claims the owner with no AI flag. The deterministic shortcuts
 * (single member, no rule) never reach the layer at all.
 *
 * Billing is asserted on the runner context: ONE run, one line per engine,
 * billed to the project owner — the pass's ledger shape, unchanged.
 */

const {
  getAppConfigValuesMock,
  canUseSmartAssignMock,
  runModelDecisionMock,
  runLlmDecisionMock,
  insertEventsMock,
  insertNotificationsMock,
  getUserByIdMock,
  afterOrNowMock,
  fromMock,
  rpcMock,
  getProjectAccessMock,
} = vi.hoisted(() => ({
  getAppConfigValuesMock: vi.fn<() => Promise<Record<string, string | null>>>(),
  canUseSmartAssignMock: vi.fn<(ownerId: string) => Promise<boolean>>(),
  runModelDecisionMock: vi.fn<
    (
      spec: unknown,
      ctx: { runId: string; seq?: number; billTo: unknown; projectId?: string | null }
    ) => Promise<unknown>
  >(),
  runLlmDecisionMock: vi.fn<
    (
      spec: unknown,
      ctx: { runId: string; seq?: number; billTo: unknown; projectId?: string | null }
    ) => Promise<unknown>
  >(),
  insertEventsMock: vi.fn<(rows: unknown) => Promise<unknown>>(),
  insertNotificationsMock: vi.fn<(rows: unknown) => Promise<unknown>>(),
  getUserByIdMock: vi.fn<(id: string) => Promise<unknown>>(),
  afterOrNowMock: vi.fn<(work: () => void | Promise<void>) => void>(),
  fromMock: vi.fn<(table: string) => unknown>(),
  rpcMock: vi.fn<
    (name: string, args: unknown, options?: { head?: boolean }) => Promise<unknown>
  >(),
  getProjectAccessMock: vi.fn<(userId: string, projectId: string) => Promise<unknown>>(),
}));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: getAppConfigValuesMock,
}));
vi.mock("@/lib/server/entitlements", () => ({
  canUseSmartAssign: canUseSmartAssignMock,
}));
vi.mock("@/lib/server/decisions/decision-model", () => ({
  runModelDecision: runModelDecisionMock,
}));
vi.mock("@/lib/server/decisions/llm", () => ({
  runLlmDecision: runLlmDecisionMock,
  warmLlmDecision: () => {},
}));
vi.mock("@/lib/server/issue-events", () => ({
  insertEvents: insertEventsMock,
}));
vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: insertNotificationsMock,
}));
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: afterOrNowMock,
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: fromMock,
    rpc: rpcMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  }),
}));

import {
  readSmartAssignBackfill,
  requestSmartAssignBackfill,
  runSmartAssign,
  runSmartAssignBackfill,
  smartAssignPickFrom,
  sweepUnassignedIssues,
} from "./smart-assign";
import type { DecisionAnswers } from "./decisions/types";

const NAMES: Record<string, string> = {
  "user-owner": "Clément",
  "user-dev": "Ada",
  "user-qa": "Grace",
};

const DB = {
  project: {
    id: "project-1",
    name: "minddy",
    owner_id: "user-owner",
    smart_assign_enabled: true,
    smart_assign_from_status: "backlog",
    automations: [],
    smart_assign_rules: { "user-dev": "All things backend" } as Record<string, string>,
  },
  issue: {
    id: "issue-1",
    title: "Fix the login crash",
    description: "It crashes on submit.",
    status: "todo",
    priority: "high",
    effort: "m",
    assignee_id: null as string | null,
    objective_id: null as string | null,
    parent_id: null as string | null,
  },
  members: [{ user_id: "user-dev" }, { user_id: "user-qa" }],
  categories: [{ category_id: "cat-bug" }, { category_id: "cat-tech" }],
};

const updatePayloads: unknown[] = [];
/** The work `afterOrNow` scheduled, in order — the deferral contract's
 * observable. Default behavior of the mock: capture, never run. */
const deferredWorks: (() => void | Promise<void>)[] = [];

/** A PostgREST chain reduced to what the run touches: chained filters are
 * ignored; `maybeSingle()` / the await resolve the given row, `update()`
 * records its payload (the claim's compare-and-set is what we assert on). */
function fakeQuery(
  resolve: (updated: boolean, selection: string) => { data: unknown; error: unknown }
): unknown {
  const query: Record<string, unknown> = {};
  let updated = false;
  // The columns of a read tell the reads of one table apart.
  let selection = "";
  for (const method of ["eq", "neq", "is", "not", "in", "or", "order", "limit"]) {
    query[method] = () => query;
  }
  query.select = (columns?: string) => {
    if (!updated) selection = columns ?? "";
    return query;
  };
  query.update = (payload: unknown) => {
    updated = true;
    updatePayloads.push(payload);
    return query;
  };
  query.maybeSingle = () => Promise.resolve(resolve(updated, selection));
  query.then = (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(resolve(updated, selection)).then(onFulfilled);
  return query;
}

/** What the hint reads of the run answer (MIN-957). Empty by default: the
 * decision then sees a team with no open issue and no tie to the issue. */
const HINTS = {
  workload: [] as Array<{ assignee_id: string; effort: string | null }>,
  objectiveLead: null as string | null,
  relations: [] as Array<{ source_id: string; target_id: string }>,
  related: [] as Array<{ id: string; assignee_id: string | null }>,
  recent: [] as Array<{ id: string; assignee_id: string }>,
  fail: false,
};
function resetHints() {
  Object.assign(HINTS, {
    workload: [], objectiveLead: null, relations: [], related: [], recent: [], fail: false,
  });
}
/** The hint reads on `issues`, told apart by their columns; `null` for any
 * other read of the table (the guard read, the claim, the sweep scan). */
function hintRead(selection: string): { data: unknown; error: unknown } | null {
  const answer = (data: unknown) =>
    HINTS.fail ? { data: null, error: { message: "down" } } : { data, error: null };
  if (selection === "assignee_id, effort") return answer(HINTS.workload);
  if (selection === "id, assignee_id") return answer(HINTS.related);
  if (selection.includes("issue_categories!inner")) return answer(HINTS.recent);
  return null;
}

/** The run's guard read is the FIRST issues query; the claim's
 * compare-and-set is the SECOND — a second query can only be the claim. */
function wireDb() {
  fromMock.mockImplementation((table: string) => {
    if (table === "projects") return fakeQuery(() => ({ data: DB.project, error: null }));
    if (table === "project_members") return fakeQuery(() => ({ data: DB.members, error: null }));
    if (table === "issue_categories")
      return fakeQuery(() => ({ data: DB.categories, error: null }));
    if (table === "categories") return fakeQuery(() => ({ data: [
      { id: "cat-bug", project_id: "project-1", name: "Bug" },
      { id: "cat-tech", project_id: "project-1", name: "Technique" },
    ], error: null }));
    if (table === "objectives")
      return fakeQuery(() => ({
        data: HINTS.objectiveLead ? { id: "objective-1", lead_user_id: HINTS.objectiveLead } : null,
        error: null,
      }));
    if (table === "issue_relations")
      return fakeQuery(() => ({ data: HINTS.relations, error: null }));
    if (table === "issues") {
      return fakeQuery((updated, selection) =>
        updated
          ? { data: { id: DB.issue.id }, error: null }
          : (hintRead(selection) ?? { data: DB.issue, error: null })
      );
    }
    return fakeQuery(() => ({ data: null, error: null }));
  });
}

function wireAuthUsers() {
  getUserByIdMock.mockImplementation(async (id: string) => ({
    data: {
      user: { id, email: `${id}@example.com`, user_metadata: { display_name: NAMES[id] } },
    },
    error: null,
  }));
}

const modelAnswer = (userId: string, confidence: number): DecisionAnswers => ({
  user_id: { value: userId, probability: confidence, confidence },
});
const llmAnswer = (userId: string): DecisionAnswers => ({
  user_id: { value: userId, probability: null, confidence: null },
});

/** Runs the work the run deferred to `after()`, and settles it. */
async function runDeferred(): Promise<void> {
  const captured = deferredWorks.splice(0);
  for (const work of captured) await work();
}

const sweepRun = () =>
  runSmartAssign({
    issueId: "issue-1",
    projectId: "project-1",
    triggerActorId: "user-creator",
    trigger: "sweep",
  });


/** A decision-model result: the answers and the versioned model that gave them. */
function answered<T>(answers: T) {
  return { answers, model: "typesafe/jev-1.13-20260917" };
}

describe("runSmartAssign — decision layer", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    canUseSmartAssignMock.mockReset().mockResolvedValue(true);
    runModelDecisionMock.mockReset().mockResolvedValue(null);
    runLlmDecisionMock.mockReset().mockResolvedValue(null);
    insertEventsMock.mockReset().mockResolvedValue(null);
    insertNotificationsMock.mockReset().mockResolvedValue(null);
    getUserByIdMock.mockReset();
    deferredWorks.length = 0;
    afterOrNowMock
      .mockReset()
      .mockImplementation((work: () => void | Promise<void>) => {
        deferredWorks.push(work);
      });
    wireDb();
    wireAuthUsers();
    resetHints();
    DB.issue.status = "todo";
    DB.issue.objective_id = null;
    DB.issue.parent_id = null;
    DB.project.smart_assign_from_status = "backlog";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("claims a confident decision-model answer with the AI flag, and never calls the LLM", async () => {
    runModelDecisionMock.mockResolvedValue(answered(modelAnswer("user-qa", 0.8)));
    await expect(sweepRun()).resolves.toBe("user-qa");
    expect(runLlmDecisionMock).not.toHaveBeenCalled();
    expect(updatePayloads).toContainEqual({ assignee_id: "user-qa" });
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      {
        issue_id: "issue-1",
        actor_id: null,
        type: "updated",
        field: "assignee_id",
        from_value: null,
        to_value: "user-qa",
        via_smart_assign: true,
        smart_assign_ai: true,
      },
    ]);
    expect(insertNotificationsMock).toHaveBeenCalledWith(expect.anything(), [
      {
        user_id: "user-qa",
        project_id: "project-1",
        type: "assigned",
        issue_id: "issue-1",
        actor_id: null,
        via_smart_assign: true,
      },
    ]);
  });

  it("falls back to the LLM when the decision model is unsure, and claims ITS answer", async () => {
    runModelDecisionMock.mockResolvedValue(answered(modelAnswer("user-qa", 0.3)));
    runLlmDecisionMock.mockResolvedValue(llmAnswer("user-dev"));
    await expect(sweepRun()).resolves.toBe("user-dev");
    expect(runModelDecisionMock).toHaveBeenCalledTimes(1);
    expect(runLlmDecisionMock).toHaveBeenCalledTimes(1);
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ to_value: "user-dev", smart_assign_ai: true }),
    ]);
  });

  it("falls back to the LLM when the decision model is unavailable, never retrying it", async () => {
    runModelDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue(llmAnswer("user-dev"));
    await expect(sweepRun()).resolves.toBe("user-dev");
    expect(runModelDecisionMock).toHaveBeenCalledTimes(1);
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
  });

  it("claims the OWNER without the AI flag when both engines fail", async () => {
    await expect(sweepRun()).resolves.toBe("user-owner");
    expect(updatePayloads).toContainEqual({ assignee_id: "user-owner" });
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ to_value: "user-owner", smart_assign_ai: false }),
    ]);
  });

  it("claims the owner when the outcome carries no usable answer", async () => {
    runModelDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue({});
    await expect(sweepRun()).resolves.toBe("user-owner");
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ to_value: "user-owner", smart_assign_ai: false }),
    ]);
  });

  it("bills BOTH engines to the project owner, on ONE run", async () => {
    runModelDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue(llmAnswer("user-dev"));
    await sweepRun();
    const [modelSpec, modelCtx] = runModelDecisionMock.mock.calls[0] as [
      Record<string, unknown>,
      { runId: string; seq?: number; billTo: unknown; projectId?: string | null },
    ];
    const [, llmCtx] = runLlmDecisionMock.mock.calls[0] as [
      unknown,
      { runId: string; seq?: number; billTo: unknown; projectId?: string | null },
    ];
    expect(modelCtx.billTo).toEqual({ projectOwner: "project-1" });
    expect(modelCtx.projectId).toBe("project-1");
    expect(llmCtx.runId).toBe(modelCtx.runId);
    expect(modelCtx.seq).toBe(0);
    expect(llmCtx.seq).toBe(1);
    // And the spec rides the whole team, rules included — the same world
    // both engines decide on.
    expect(modelSpec.useCase).toBe("smart_assign");
    expect(modelSpec.state).toMatchObject({
      project: "minddy",
      issue: { title: "Fix the login crash", categories: "Bug, Technique" },
      members: [
        { id: "user-owner", name: "Clément", owner: true, rule: null },
        { id: "user-dev", name: "Ada", owner: false, rule: "All things backend" },
        { id: "user-qa", name: "Grace", owner: false, rule: null },
      ],
    });
  });

  it("offers exactly the real member ids to both engines", async () => {
    runModelDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue(llmAnswer("user-dev"));
    await sweepRun();
    const [modelSpec] = runModelDecisionMock.mock.calls[0] as [Record<string, unknown>, unknown];
    const [llmSpec] = runLlmDecisionMock.mock.calls[0] as [Record<string, unknown>, unknown];
    const question = (modelSpec.questions as { key: string; options?: { value: string }[] }[])[0];
    expect(question.key).toBe("user_id");
    expect(question.options?.map((o) => o.value)).toEqual([
      "user-owner",
      "user-dev",
      "user-qa",
    ]);
    const parameters = llmSpec.llm as { parameters: { properties: { user_id: { enum: string[] } } } };
    expect(parameters.parameters.properties.user_id.enum).toEqual([
      "user-owner",
      "user-dev",
      "user-qa",
    ]);
  });

  it("skips the layer entirely for a single-member team", async () => {
    DB.members = [];
    try {
      await expect(sweepRun()).resolves.toBe("user-owner");
      expect(canUseSmartAssignMock).not.toHaveBeenCalled();
      expect(runModelDecisionMock).not.toHaveBeenCalled();
      expect(runLlmDecisionMock).not.toHaveBeenCalled();
      expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({ to_value: "user-owner", smart_assign_ai: false }),
      ]);
    } finally {
      DB.members = [{ user_id: "user-dev" }, { user_id: "user-qa" }];
    }
  });

  it("skips the layer entirely when nobody has a rule", async () => {
    DB.project.smart_assign_rules = {};
    try {
      await expect(sweepRun()).resolves.toBe("user-owner");
      expect(canUseSmartAssignMock).not.toHaveBeenCalled();
      expect(runModelDecisionMock).not.toHaveBeenCalled();
      expect(runLlmDecisionMock).not.toHaveBeenCalled();
    } finally {
      DB.project.smart_assign_rules = { "user-dev": "All things backend" };
    }
  });

  it("stays silent when the toggle is off, the ticket is taken, or the status is ineligible", async () => {
    DB.project.smart_assign_enabled = false;
    try {
      await expect(sweepRun()).resolves.toBeNull();
      expect(updatePayloads).toEqual([]);
      expect(runModelDecisionMock).not.toHaveBeenCalled();

      DB.project.smart_assign_enabled = true;
      DB.issue.assignee_id = "user-dev";
      await expect(sweepRun()).resolves.toBeNull();
      expect(updatePayloads).toEqual([]);

      DB.issue.assignee_id = null;
      DB.issue.status = "triage";
      await expect(sweepRun()).resolves.toBeNull();
      expect(runModelDecisionMock).not.toHaveBeenCalled();
      expect(updatePayloads).toEqual([]);
    } finally {
      DB.issue.status = "todo";
    }
  });

  it("keeps the deterministic contract on a dry budget: owner, no engine", async () => {
    canUseSmartAssignMock.mockResolvedValue(false);
    await expect(sweepRun()).resolves.toBe("user-owner");
    expect(runModelDecisionMock).not.toHaveBeenCalled();
    expect(runLlmDecisionMock).not.toHaveBeenCalled();
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ to_value: "user-owner", smart_assign_ai: false }),
    ]);
  });

  it("defers the decision for a creation, and writes nothing before the response", async () => {
    runModelDecisionMock.mockResolvedValue(answered(modelAnswer("user-qa", 0.8)));
    await expect(
      runSmartAssign({
        issueId: "issue-1",
        projectId: "project-1",
        triggerActorId: "user-creator",
        trigger: "create",
      })
    ).resolves.toBeNull();
    expect(updatePayloads).toEqual([]);
    expect(insertEventsMock).not.toHaveBeenCalled();
    // Then the deferred work runs, and the assignment lands with its event.
    await runDeferred();
    expect(updatePayloads).toContainEqual({ assignee_id: "user-qa" });
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ to_value: "user-qa", smart_assign_ai: true }),
    ]);
  });

  it("survives a crash inside the layer and still assigns the owner", async () => {
    getUserByIdMock.mockRejectedValue(new Error("auth admin down"));
    await expect(sweepRun()).resolves.toBe("user-owner");
    expect(updatePayloads).toContainEqual({ assignee_id: "user-owner" });
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ smart_assign_ai: false }),
    ]);
  });
});

describe("runSmartAssign — start status (MIN-957)", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    canUseSmartAssignMock.mockReset().mockResolvedValue(true);
    runModelDecisionMock.mockReset().mockResolvedValue(answered(modelAnswer("user-dev", 0.8)));
    runLlmDecisionMock.mockReset().mockResolvedValue(null);
    insertEventsMock.mockReset().mockResolvedValue(null);
    insertNotificationsMock.mockReset().mockResolvedValue(null);
    getUserByIdMock.mockReset();
    deferredWorks.length = 0;
    afterOrNowMock.mockReset().mockImplementation((work: () => void | Promise<void>) => {
      deferredWorks.push(work);
    });
    wireDb();
    wireAuthUsers();
    resetHints();
    DB.issue.status = "todo";
    DB.project.smart_assign_from_status = "todo";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const run = (trigger: "create" | "unassign" | "sweep" | "start_status" | "triage_exit") =>
    runSmartAssign({
      issueId: "issue-1",
      projectId: "project-1",
      triggerActorId: "user-creator",
      trigger,
      ...(trigger === "start_status" ? { previousStatus: "backlog" } : {}),
    });

  it.each(["create", "unassign", "sweep", "triage_exit"] as const)(
    "leaves a backlog issue empty on %s when the project assigns from todo",
    async (trigger) => {
      DB.issue.status = "backlog";
      await expect(run(trigger)).resolves.toBeNull();
      await runDeferred();
      expect(updatePayloads).toEqual([]);
      expect(runModelDecisionMock).not.toHaveBeenCalled();
    }
  );

  it("assigns the issue when it leaves the backlog", async () => {
    await run("start_status");
    await runDeferred();
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
  });

  it("assigns an issue created in todo, as before", async () => {
    await run("create");
    await runDeferred();
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
  });

  it("changes nothing for the same move in a project that assigns from backlog", async () => {
    // The issue was already covered in the backlog: it is empty by choice
    // (older than the activation, or unassigned by hand), not waiting.
    DB.project.smart_assign_from_status = "backlog";
    await expect(run("start_status")).resolves.toBeNull();
    await runDeferred();
    expect(updatePayloads).toEqual([]);
  });

  it("limits the backfill run to todo", async () => {
    const backfill = () =>
      runSmartAssign({
        issueId: "issue-1",
        projectId: "project-1",
        triggerActorId: "user-owner",
        trigger: "backfill",
      });
    DB.issue.status = "backlog";
    await expect(backfill()).resolves.toBeNull();
    DB.issue.status = "todo";
    await expect(backfill()).resolves.toBe("user-dev");
  });
});

describe("runSmartAssign — workload and context hints (MIN-957)", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    canUseSmartAssignMock.mockReset().mockResolvedValue(true);
    runModelDecisionMock.mockReset().mockResolvedValue(answered(modelAnswer("user-qa", 0.8)));
    runLlmDecisionMock.mockReset().mockResolvedValue(null);
    insertEventsMock.mockReset().mockResolvedValue(null);
    insertNotificationsMock.mockReset().mockResolvedValue(null);
    getUserByIdMock.mockReset();
    afterOrNowMock.mockReset().mockImplementation(() => {});
    wireDb();
    wireAuthUsers();
    resetHints();
    DB.issue.status = "todo";
    DB.issue.objective_id = "objective-1";
    DB.issue.parent_id = "issue-parent";
    DB.project.smart_assign_from_status = "backlog";
    // Two members with the same rule; one of them is loaded.
    DB.project.smart_assign_rules = { "user-dev": "Backend", "user-qa": "Backend" };
    HINTS.workload = [
      { assignee_id: "user-dev", effort: "xl" },
      { assignee_id: "user-dev", effort: "l" },
      { assignee_id: "user-dev", effort: null },
      { assignee_id: "user-qa", effort: "xs" },
      // Someone who left the team is nobody's workload.
      { assignee_id: "user-gone", effort: "xl" },
    ];
    HINTS.objectiveLead = "user-qa";
    HINTS.relations = [
      { source_id: "issue-1", target_id: "issue-2" },
      { source_id: "issue-3", target_id: "issue-1" },
    ];
    HINTS.related = [
      { id: "issue-parent", assignee_id: "user-qa" },
      { id: "issue-2", assignee_id: "user-qa" },
      { id: "issue-3", assignee_id: null },
    ];
    HINTS.recent = [
      { id: "issue-7", assignee_id: "user-dev" },
      { id: "issue-8", assignee_id: "user-qa" },
    ];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    DB.issue.objective_id = null;
    DB.issue.parent_id = null;
    DB.project.smart_assign_rules = { "user-dev": "All things backend" };
  });

  const specOf = () =>
    runModelDecisionMock.mock.calls[0][0] as {
      state: { members: Array<Record<string, unknown>> };
      questions: Array<{ label: string }>;
      llm: { userMessage: string; systemPrompt: string };
    };

  it("gives both engines each member's workload and ties to the issue", async () => {
    await expect(sweepRun()).resolves.toBe("user-qa");
    const spec = specOf();
    expect(spec.state.members).toEqual([
      {
        id: "user-owner", name: "Clément", owner: true, rule: null,
        open_issues: 0, open_effort_points: 0, leads_objective: false,
        related_issues: 0, recent_category_issues: 0,
      },
      {
        // xl (8) + l (5) + an unsized issue counted as a medium (3).
        id: "user-dev", name: "Ada", owner: false, rule: "Backend",
        open_issues: 3, open_effort_points: 16, leads_objective: false,
        related_issues: 0, recent_category_issues: 1,
      },
      {
        id: "user-qa", name: "Grace", owner: false, rule: "Backend",
        open_issues: 1, open_effort_points: 1, leads_objective: true,
        related_issues: 2, recent_category_issues: 1,
      },
    ]);
    expect(spec.llm.userMessage).toContain("Workload: 3 open issues (16 effort points)");
    expect(spec.llm.userMessage).toContain(
      "Context: leads this issue's objective; assigned to 2 related issues; completed 1 recent issue in the same categories"
    );
  });

  it("presents the hints as tie-breakers, never as a reason to skip the only fitting member", async () => {
    await sweepRun();
    const spec = specOf();
    for (const text of [spec.questions[0].label, spec.llm.systemPrompt]) {
      expect(text).toContain("the assignment rules decide who is able to handle the issue");
      expect(text).toContain("Never pass over the only member whose rule fits because they are busy");
    }
  });

  it("assigns the loaded member when the layer picks them: the load never blocks", async () => {
    runModelDecisionMock.mockResolvedValue(answered(modelAnswer("user-dev", 0.9)));
    await expect(sweepRun()).resolves.toBe("user-dev");
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
  });

  it("decides on the rules alone when the hints cannot be read", async () => {
    HINTS.fail = true;
    await expect(sweepRun()).resolves.toBe("user-qa");
    const spec = specOf();
    expect(spec.state.members[1]).toEqual({
      id: "user-dev", name: "Ada", owner: false, rule: "Backend",
    });
    expect(spec.llm.userMessage).not.toContain("Workload");
  });

  it("reads no hint for the deterministic cases", async () => {
    DB.project.smart_assign_rules = {};
    HINTS.fail = true;
    await expect(sweepRun()).resolves.toBe("user-owner");
    expect(runModelDecisionMock).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("sweepUnassignedIssues", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    resetHints();
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    canUseSmartAssignMock.mockReset().mockResolvedValue(true);
    runModelDecisionMock.mockReset().mockResolvedValue(answered(modelAnswer("user-dev", 0.8)));
    runLlmDecisionMock.mockReset().mockResolvedValue(null);
    insertEventsMock.mockReset().mockResolvedValue(null);
    insertNotificationsMock.mockReset().mockResolvedValue(null);
    getUserByIdMock.mockReset();
    afterOrNowMock.mockReset().mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sweeps through the decision layer and counts what it claimed", async () => {
    let scans = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "issues") {
        return fakeQuery((updated, selection) => {
          // The claim's compare-and-set.
          if (updated) return { data: { id: "issue-9" }, error: null };
          // The candidates scans, one per start status: the issue belongs to
          // a project that assigns from backlog, read first.
          if (selection.includes("projects!inner")) {
            scans += 1;
            return {
              data:
                scans === 1
                  ? [{ id: "issue-9", project_id: "project-1", created_at: "2026-11-09T10:00:00Z" }]
                  : [],
              error: null,
            };
          }
          // The run's hint reads, then its guard read.
          return hintRead(selection) ?? { data: { ...DB.issue, id: "issue-9" }, error: null };
        });
      }
      if (table === "issue_events") return fakeQuery(() => ({ data: [], error: null }));
      if (table === "projects") return fakeQuery(() => ({ data: DB.project, error: null }));
      if (table === "project_members")
        return fakeQuery(() => ({ data: DB.members, error: null }));
      if (table === "issue_categories")
        return fakeQuery(() => ({ data: DB.categories, error: null }));
      return fakeQuery(() => ({ data: null, error: null }));
    });
    wireAuthUsers();
    await expect(sweepUnassignedIssues()).resolves.toEqual({ candidates: 1, assigned: 1 });
    expect(scans).toBe(2);
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ issue_id: "issue-9", smart_assign_ai: true }),
    ]);
  });
});

describe("Smart Assign backfill (MIN-903)", () => {
  /** What the candidates function answers: the count before and after the
   * pass (head reads), and the ids of the pass. */
  let counts: number[] = [];
  let candidateIds: string[] = [];
  /** Unread grouped lines already in the inbox, and the ids the pass removed. */
  let unreadBatches: Array<{ id: string; user_id: string; issue_count: number }> = [];
  let notificationsDeleted = false;
  /** `false` = someone assigned the issue before the claim. */
  let claimWins = true;

  beforeEach(() => {
    updatePayloads.length = 0;
    counts = [2, 0];
    candidateIds = ["issue-a", "issue-b"];
    unreadBatches = [];
    notificationsDeleted = false;
    claimWins = true;
    DB.issue.status = "todo";
    DB.project.smart_assign_rules = { "user-dev": "All things backend" };
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    canUseSmartAssignMock.mockReset().mockResolvedValue(true);
    runModelDecisionMock.mockReset().mockResolvedValue(answered(modelAnswer("user-dev", 0.8)));
    runLlmDecisionMock.mockReset().mockResolvedValue(null);
    insertEventsMock.mockReset().mockResolvedValue(null);
    insertNotificationsMock.mockReset().mockResolvedValue(1);
    getUserByIdMock.mockReset();
    getProjectAccessMock.mockReset();
    deferredWorks.length = 0;
    afterOrNowMock.mockReset().mockImplementation((work: () => void | Promise<void>) => {
      deferredWorks.push(work);
    });
    rpcMock.mockReset().mockImplementation(async (_name, _args, options) =>
      options?.head
        ? { count: counts.shift() ?? 0, error: null }
        : { data: candidateIds, error: null }
    );
    wireAuthUsers();
    fromMock.mockImplementation((table: string) => {
      if (table === "projects") return fakeQuery(() => ({ data: DB.project, error: null }));
      if (table === "project_members") return fakeQuery(() => ({ data: DB.members, error: null }));
      if (table === "issue_categories")
        return fakeQuery(() => ({ data: DB.categories, error: null }));
      if (table === "issues") {
        return fakeQuery((updated) =>
          updated
            ? { data: claimWins ? { id: DB.issue.id } : null, error: null }
            : { data: DB.issue, error: null }
        );
      }
      if (table === "notifications") {
        const query = fakeQuery(() => ({ data: unreadBatches, error: null })) as Record<
          string,
          unknown
        >;
        query.delete = () => {
          notificationsDeleted = true;
          return query;
        };
        return query;
      }
      return fakeQuery(() => ({ data: null, error: null }));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const backfillRun = () =>
    runSmartAssign({
      issueId: "issue-1",
      projectId: "project-1",
      triggerActorId: "user-owner",
      trigger: "backfill",
    });

  it.each(["triage", "in_progress", "in_review", "done", "canceled", "duplicate"])(
    "leaves a %s issue alone",
    async (status) => {
      DB.issue.status = status;
      await expect(backfillRun()).resolves.toBeNull();
      expect(updatePayloads).toEqual([]);
      expect(runModelDecisionMock).not.toHaveBeenCalled();
    }
  );

  it.each(["backlog", "todo"])("assigns a %s issue, with no line per issue", async (status) => {
    DB.issue.status = status;
    await expect(backfillRun()).resolves.toBe("user-dev");
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
    expect(insertNotificationsMock).not.toHaveBeenCalled();
  });

  it("tells each assignee once with the number of issues, then closes the request", async () => {
    await expect(runSmartAssignBackfill("project-1")).resolves.toEqual({
      assigned: 2,
      remaining: 0,
      outcome: "done",
    });
    expect(insertNotificationsMock).toHaveBeenCalledTimes(1);
    expect(insertNotificationsMock).toHaveBeenCalledWith(expect.anything(), [
      {
        user_id: "user-dev",
        project_id: "project-1",
        type: "smart_assign_batch",
        issue_id: null,
        actor_id: null,
        via_smart_assign: true,
        issue_count: 2,
      },
    ]);
    expect(updatePayloads).toContainEqual({ smart_assign_backfill_requested_at: null });
  });

  it("adds to the grouped line the assignee has not read yet", async () => {
    unreadBatches = [{ id: "notif-1", user_id: "user-dev", issue_count: 3 }];
    await runSmartAssignBackfill("project-1");
    expect(insertNotificationsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ user_id: "user-dev", issue_count: 5 }),
    ]);
    expect(notificationsDeleted).toBe(true);
  });

  it("does not announce to the owner the issues their own backfill gave them", async () => {
    DB.project.smart_assign_rules = {};
    await expect(runSmartAssignBackfill("project-1")).resolves.toMatchObject({ assigned: 2 });
    expect(updatePayloads).toContainEqual({ assignee_id: "user-owner" });
    expect(insertNotificationsMock).not.toHaveBeenCalled();
  });

  it("never replaces an assignee set while it runs", async () => {
    claimWins = false;
    counts = [2, 0];
    await expect(runSmartAssignBackfill("project-1")).resolves.toMatchObject({ assigned: 0 });
    expect(insertEventsMock).not.toHaveBeenCalled();
    expect(insertNotificationsMock).not.toHaveBeenCalled();
  });

  it("stops on an empty AI budget and leaves the issues unassigned", async () => {
    canUseSmartAssignMock.mockResolvedValue(false);
    counts = [2, 2];
    await expect(runSmartAssignBackfill("project-1")).resolves.toEqual({
      assigned: 0,
      remaining: 2,
      outcome: "budget",
    });
    expect(updatePayloads).not.toContainEqual(expect.objectContaining({ assignee_id: expect.anything() }));
    expect(updatePayloads).toContainEqual({ smart_assign_backfill_requested_at: null });
  });

  it("keeps the request when issues are left for the next pass", async () => {
    counts = [5, 3];
    await expect(runSmartAssignBackfill("project-1")).resolves.toEqual({
      assigned: 2,
      remaining: 3,
      outcome: "continue",
    });
    expect(updatePayloads).not.toContainEqual({ smart_assign_backfill_requested_at: null });
  });

  it("closes a request that makes no progress", async () => {
    claimWins = false;
    counts = [2, 2];
    await expect(runSmartAssignBackfill("project-1")).resolves.toMatchObject({
      outcome: "stalled",
    });
    expect(updatePayloads).toContainEqual({ smart_assign_backfill_requested_at: null });
  });

  it("closes the request when Smart Assign was turned off meanwhile", async () => {
    fromMock.mockImplementation((table: string) =>
      fakeQuery(() => ({
        data: table === "projects" ? { ...DB.project, smart_assign_enabled: false } : null,
        error: null,
      }))
    );
    await expect(runSmartAssignBackfill("project-1")).resolves.toMatchObject({
      outcome: "disabled",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  describe("requestSmartAssignBackfill", () => {
    const ALL_RULES = { "user-owner": "Product", "user-dev": "Backend", "user-qa": "Tests" };
    const access = (overrides: Record<string, unknown> = {}) => ({
      isOwner: true,
      project: {
        ...DB.project,
        smart_assign_rules: ALL_RULES,
        smart_assign_backfill_requested_at: null,
      },
      ...overrides,
    });

    it("is refused while a member has no assignment rule", async () => {
      getProjectAccessMock.mockResolvedValue(
        access({ project: { ...DB.project, smart_assign_rules: { "user-dev": "Backend" } } })
      );
      await expect(requestSmartAssignBackfill("user-owner", "project-1")).resolves.toMatchObject({
        ok: false,
        status: 409,
        errorKey: "smartAssignRulesMissing",
      });
      expect(updatePayloads).toEqual([]);
      expect(deferredWorks).toEqual([]);
    });

    it("tells the settings that rules are missing, and how many issues wait", async () => {
      getProjectAccessMock.mockResolvedValue(
        access({ project: { ...DB.project, smart_assign_rules: {} } })
      );
      counts = [4];
      await expect(readSmartAssignBackfill("user-owner", "project-1")).resolves.toEqual({
        ok: true,
        count: 4,
        running: false,
        rulesMissing: true,
      });
    });

    it("needs no rule in a project with the owner alone", async () => {
      const members = DB.members;
      DB.members = [];
      getProjectAccessMock.mockResolvedValue(
        access({ project: { ...DB.project, smart_assign_rules: {} } })
      );
      counts = [2, 2, 0];
      await expect(requestSmartAssignBackfill("user-owner", "project-1")).resolves.toMatchObject({
        ok: true,
        running: true,
      });
      DB.members = members;
    });

    it("is refused to anyone but the owner", async () => {
      getProjectAccessMock.mockResolvedValue(access({ isOwner: false }));
      await expect(requestSmartAssignBackfill("user-dev", "project-1")).resolves.toMatchObject({
        ok: false,
        status: 403,
        errorKey: "ownerOnly",
      });
      expect(updatePayloads).toEqual([]);
    });

    it("is refused while Smart Assign is off", async () => {
      getProjectAccessMock.mockResolvedValue(
        access({ project: { ...DB.project, smart_assign_enabled: false } })
      );
      await expect(requestSmartAssignBackfill("user-owner", "project-1")).resolves.toMatchObject({
        ok: false,
        errorKey: "smartAssignOff",
      });
    });

    it("records nothing when no open issue is waiting", async () => {
      getProjectAccessMock.mockResolvedValue(access());
      counts = [0];
      await expect(requestSmartAssignBackfill("user-owner", "project-1")).resolves.toEqual({
        ok: true,
        count: 0,
        running: false,
        rulesMissing: false,
      });
      expect(updatePayloads).toEqual([]);
      expect(deferredWorks).toEqual([]);
    });

    it("records the request and starts the first pass after the response", async () => {
      getProjectAccessMock.mockResolvedValue(access());
      counts = [2, 2, 0];
      await expect(requestSmartAssignBackfill("user-owner", "project-1")).resolves.toEqual({
        ok: true,
        count: 2,
        running: true,
        rulesMissing: false,
      });
      expect(updatePayloads).toEqual([
        { smart_assign_backfill_requested_at: expect.any(String) },
      ]);
      expect(insertEventsMock).not.toHaveBeenCalled();
      await runDeferred();
      expect(insertEventsMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("smartAssignPickFrom", () => {
  it("keeps a textual answer that is one of the real members", () => {
    expect(
      smartAssignPickFrom(
        {
          engine: "model",
          answers: { user_id: { value: "user-dev", probability: 0.8, confidence: 0.8 } },
          confidence: 0.8,
          fallbackReason: null,
        },
        ["user-owner", "user-dev"]
      )
    ).toBe("user-dev");
  });

  it("drops anything else — null outcome, missing answer, invented id", () => {
    expect(smartAssignPickFrom(null, ["user-owner"])).toBeNull();
    expect(smartAssignPickFrom({ engine: "llm", answers: {}, confidence: 1, fallbackReason: null }, ["user-owner"])).toBeNull();
    expect(
      smartAssignPickFrom(
        {
          engine: "llm",
          answers: { user_id: { value: "user-fantôme", probability: null, confidence: null } },
          confidence: 1,
          fallbackReason: null,
        },
        ["user-owner"]
      )
    ).toBeNull();
  });
});
