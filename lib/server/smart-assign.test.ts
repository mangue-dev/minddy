import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE BRANCH (MIN-564) — `runSmartAssign` through the decision layer.
 *
 * The two engine adapters are doubles, exactly like `runner.test.ts` mocks
 * them: what is pinned here is the AGREEMENT — the spec carries the team
 * (names, owner mark, rules) and the real member ids; a confident Jev
 * decides alone; Jev down or unsure replays the `choose_assignee` LLM pass;
 * both failing claims the owner with no AI flag. The deterministic shortcuts
 * (single member, no rule) never reach the layer at all.
 *
 * Billing is asserted on the runner context: ONE run, one line per engine,
 * billed to the project owner — the pass's ledger shape, unchanged.
 */

const {
  getAppConfigValuesMock,
  canUseSmartAssignMock,
  runJevDecisionMock,
  runLlmDecisionMock,
  insertEventsMock,
  insertNotificationsMock,
  getUserByIdMock,
  afterOrNowMock,
  fromMock,
} = vi.hoisted(() => ({
  getAppConfigValuesMock: vi.fn<() => Promise<Record<string, string | null>>>(),
  canUseSmartAssignMock: vi.fn<(ownerId: string) => Promise<boolean>>(),
  runJevDecisionMock: vi.fn<
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
}));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: getAppConfigValuesMock,
}));
vi.mock("@/lib/server/entitlements", () => ({
  canUseSmartAssign: canUseSmartAssignMock,
}));
vi.mock("@/lib/server/decisions/jev", () => ({
  runJevDecision: runJevDecisionMock,
}));
vi.mock("@/lib/server/decisions/llm", () => ({
  runLlmDecision: runLlmDecisionMock,
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
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: fromMock, auth: { admin: { getUserById: getUserByIdMock } } }),
}));

import { runSmartAssign, smartAssignPickFrom, sweepUnassignedIssues } from "./smart-assign";
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
  },
  members: [{ user_id: "user-dev" }, { user_id: "user-qa" }],
  categories: [{ categories: { name: "Bug" } }, { categories: { name: "Technique" } }],
};

const updatePayloads: unknown[] = [];
/** The work `afterOrNow` scheduled, in order — the deferral contract's
 * observable. Default behavior of the mock: capture, never run. */
const deferredWorks: (() => void | Promise<void>)[] = [];

/** A PostgREST chain reduced to what the run touches: chained filters are
 * ignored; `maybeSingle()` / the await resolve the given row, `update()`
 * records its payload (the claim's compare-and-set is what we assert on). */
function fakeQuery(resolve: () => { data: unknown; error: unknown }): unknown {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "not", "in", "or", "order", "limit"]) {
    query[method] = () => query;
  }
  query.update = (payload: unknown) => {
    updatePayloads.push(payload);
    return query;
  };
  query.maybeSingle = () => Promise.resolve(resolve());
  query.then = (onFulfilled: (value: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return query;
}

/** The run's guard read is the FIRST issues query; the claim's
 * compare-and-set is the SECOND — a second query can only be the claim. */
function wireDb() {
  let issueQueries = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === "projects") return fakeQuery(() => ({ data: DB.project, error: null }));
    if (table === "project_members") return fakeQuery(() => ({ data: DB.members, error: null }));
    if (table === "issue_categories")
      return fakeQuery(() => ({ data: DB.categories, error: null }));
    if (table === "issues") {
      issueQueries += 1;
      const isClaim = issueQueries > 1;
      return fakeQuery(() =>
        isClaim ? { data: { id: DB.issue.id }, error: null } : { data: DB.issue, error: null }
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

const jevAnswer = (userId: string, confidence: number): DecisionAnswers => ({
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

describe("runSmartAssign — decision layer", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    canUseSmartAssignMock.mockReset().mockResolvedValue(true);
    runJevDecisionMock.mockReset().mockResolvedValue(null);
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
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("claims a confident JEV answer with the AI flag, and never calls the LLM", async () => {
    runJevDecisionMock.mockResolvedValue(jevAnswer("user-qa", 0.8));
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

  it("falls back to the LLM when Jev is unsure, and claims ITS answer", async () => {
    runJevDecisionMock.mockResolvedValue(jevAnswer("user-qa", 0.3));
    runLlmDecisionMock.mockResolvedValue(llmAnswer("user-dev"));
    await expect(sweepRun()).resolves.toBe("user-dev");
    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
    expect(runLlmDecisionMock).toHaveBeenCalledTimes(1);
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ to_value: "user-dev", smart_assign_ai: true }),
    ]);
  });

  it("falls back to the LLM when Jev is unavailable, never retrying it", async () => {
    runJevDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue(llmAnswer("user-dev"));
    await expect(sweepRun()).resolves.toBe("user-dev");
    expect(runJevDecisionMock).toHaveBeenCalledTimes(1);
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
    runJevDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue({});
    await expect(sweepRun()).resolves.toBe("user-owner");
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ to_value: "user-owner", smart_assign_ai: false }),
    ]);
  });

  it("bills BOTH engines to the project owner, on ONE run", async () => {
    runJevDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue(llmAnswer("user-dev"));
    await sweepRun();
    const [jevSpec, jevCtx] = runJevDecisionMock.mock.calls[0] as [
      Record<string, unknown>,
      { runId: string; seq?: number; billTo: unknown; projectId?: string | null },
    ];
    const [, llmCtx] = runLlmDecisionMock.mock.calls[0] as [
      unknown,
      { runId: string; seq?: number; billTo: unknown; projectId?: string | null },
    ];
    expect(jevCtx.billTo).toEqual({ projectOwner: "project-1" });
    expect(jevCtx.projectId).toBe("project-1");
    expect(llmCtx.runId).toBe(jevCtx.runId);
    expect(jevCtx.seq).toBe(0);
    expect(llmCtx.seq).toBe(1);
    // And the spec rides the whole team, rules included — the same world
    // both engines decide on.
    expect(jevSpec.useCase).toBe("smart_assign");
    expect(jevSpec.state).toMatchObject({
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
    runJevDecisionMock.mockResolvedValue(null);
    runLlmDecisionMock.mockResolvedValue(llmAnswer("user-dev"));
    await sweepRun();
    const [jevSpec] = runJevDecisionMock.mock.calls[0] as [Record<string, unknown>, unknown];
    const [llmSpec] = runLlmDecisionMock.mock.calls[0] as [Record<string, unknown>, unknown];
    const question = (jevSpec.questions as { key: string; options?: { value: string }[] }[])[0];
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
      expect(runJevDecisionMock).not.toHaveBeenCalled();
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
      expect(runJevDecisionMock).not.toHaveBeenCalled();
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
      expect(runJevDecisionMock).not.toHaveBeenCalled();

      DB.project.smart_assign_enabled = true;
      DB.issue.assignee_id = "user-dev";
      await expect(sweepRun()).resolves.toBeNull();
      expect(updatePayloads).toEqual([]);

      DB.issue.assignee_id = null;
      DB.issue.status = "triage";
      await expect(sweepRun()).resolves.toBeNull();
      expect(runJevDecisionMock).not.toHaveBeenCalled();
      expect(updatePayloads).toEqual([]);
    } finally {
      DB.issue.status = "todo";
    }
  });

  it("keeps the deterministic contract on a dry budget: owner, no engine", async () => {
    canUseSmartAssignMock.mockResolvedValue(false);
    await expect(sweepRun()).resolves.toBe("user-owner");
    expect(runJevDecisionMock).not.toHaveBeenCalled();
    expect(runLlmDecisionMock).not.toHaveBeenCalled();
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ to_value: "user-owner", smart_assign_ai: false }),
    ]);
  });

  it("defers the decision for a creation, and writes nothing before the response", async () => {
    runJevDecisionMock.mockResolvedValue(jevAnswer("user-qa", 0.8));
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

describe("sweepUnassignedIssues", () => {
  beforeEach(() => {
    updatePayloads.length = 0;
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    canUseSmartAssignMock.mockReset().mockResolvedValue(true);
    runJevDecisionMock.mockReset().mockResolvedValue(jevAnswer("user-dev", 0.8));
    runLlmDecisionMock.mockReset().mockResolvedValue(null);
    insertEventsMock.mockReset().mockResolvedValue(null);
    insertNotificationsMock.mockReset().mockResolvedValue(null);
    getUserByIdMock.mockReset();
    afterOrNowMock.mockReset().mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sweeps through the decision layer and counts what it claimed", async () => {
    let issueQueries = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "issues") {
        issueQueries += 1;
        // 1st = the candidates scan, 2nd = the run's guard read, 3rd = the
        // claim's compare-and-set.
        if (issueQueries === 1)
          return fakeQuery(() => ({
            data: [{ id: "issue-9", project_id: "project-1" }],
            error: null,
          }));
        if (issueQueries === 2)
          return fakeQuery(() => ({ data: { ...DB.issue, id: "issue-9" }, error: null }));
        return fakeQuery(() => ({ data: { id: "issue-9" }, error: null }));
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
    expect(updatePayloads).toContainEqual({ assignee_id: "user-dev" });
    expect(insertEventsMock).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ issue_id: "issue-9", smart_assign_ai: true }),
    ]);
  });
});

describe("smartAssignPickFrom", () => {
  it("keeps a textual answer that is one of the real members", () => {
    expect(
      smartAssignPickFrom(
        {
          engine: "jev",
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
