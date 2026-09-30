import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSmartFillPrompt,
  sanitizeSmartFill,
  smartFillAnswersToRaw,
  resolveSmartFillPayer,
  runSmartFill,
  type SmartFillContext,
} from "./smart-fill";
import type { DecisionAnswers, DecisionOutcome } from "./decisions/types";

/**
 * THE WHITELIST, trained on what a small model really renders.
 *
 * Smart-fill written in a ticket without anyone proofreading: everything it
 * posts has gone through `sanitizeSmartFill`, and so this is the only place du
 * path where a crooked response can be stopped. The cases below are
 * those that we see in real life — an invented id, a similar but false enum, a ticket
 * arranged in eight categories, a `null` which means something.
 */

const CTX: SmartFillContext = {
  categories: [
    { id: "cat-bug", name: "Bug" },
    { id: "cat-feat", name: "Fonctionnalité" },
    { id: "cat-tech", name: "Technique" },
    { id: "cat-doc", name: "Documentation" },
  ],
  objectives: [
    { id: "obj-v2", name: "Refonte v2", status: "in_progress" },
    { id: "obj-seo", name: "SEO", status: "planned" },
  ],
};

describe("sanitizeSmartFill", () => {
  it("garde une réponse complète et bien formée", () => {
    expect(
      sanitizeSmartFill(
        {
          priority: "high",
          effort: "m",
          category_ids: ["cat-bug", "cat-tech"],
          objective_id: "obj-v2",
        },
        CTX,
      ),
    ).toEqual({
      priority: "high",
      effort: "m",
      category_ids: ["cat-bug", "cat-tech"],
      objective_id: "obj-v2",
    });
  });

  it("rend un patch vide quand le modèle n'a rien rendu", () => {
    // No key, HTTP failed, JSON wrong: `forcedToolCall` returns `null`,
    // and the ticket must be born as it was written.
    expect(sanitizeSmartFill(null, CTX)).toEqual({});
  });

  it("jette une priorité qui n'est pas du vocabulaire", () => {
    expect(sanitizeSmartFill({ priority: "critical" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ priority: 3 }, CTX)).toEqual({});
  });

  it("ne pose pas « none » — c'est le défaut du formulaire, pas un jugement", () => {
    expect(sanitizeSmartFill({ priority: "none" }, CTX)).toEqual({});
  });

  it("garde un effort null : « rien d'estimable » est une vraie réponse", () => {
    expect(sanitizeSmartFill({ effort: null }, CTX)).toEqual({ effort: null });
  });

  it("lit le sentinelle « none » de l'effort comme un null", () => {
    // This is the value that the SCHEMA offers for “nothing valuable”: not one
    // union type, which is not accepted everywhere in strict function calls and
    // whose refusal would not be seen (empty patch, unfilled tickets, silence).
    expect(sanitizeSmartFill({ effort: "none" }, CTX)).toEqual({ effort: null });
  });

  it("jette un effort hors barème", () => {
    expect(sanitizeSmartFill({ effort: "XXL" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ effort: 2 }, CTX)).toEqual({});
  });

  it("ne garde que les catégories qui existent dans CE projet", () => {
    expect(
      sanitizeSmartFill({ category_ids: ["cat-bug", "cat-inventée", 42] }, CTX),
    ).toEqual({ category_ids: ["cat-bug"] });
  });

  it("dédoublonne et borne à trois catégories", () => {
    expect(
      sanitizeSmartFill(
        { category_ids: ["cat-bug", "cat-bug", "cat-feat", "cat-tech", "cat-doc"] },
        CTX,
      ),
    ).toEqual({ category_ids: ["cat-bug", "cat-feat", "cat-tech"] });
  });

  it("ne pose pas de champ catégories quand aucune ne survit", () => {
    // A `category_ids: []` would write "this ticket deliberately has no
    // category » where the model only got the ids wrong.
    expect(sanitizeSmartFill({ category_ids: ["inconnue"] }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ category_ids: "Bug" }, CTX)).toEqual({});
  });

  it("refuse un objectif inventé, et n'en pose aucun", () => {
    // A ticket stored under the wrong objective costs more to undo than one
    // ticket sans objectif.
    expect(sanitizeSmartFill({ objective_id: "obj-fantôme" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ objective_id: "Refonte v2" }, CTX)).toEqual({});
  });

  it("avale le « none » d'objectif sans poser le champ", () => {
    // The answer “no objective fits”. The field remains missing from the patch,
    // so the insert doesn't write it — and no lens can carry this id,
    // these are UUIDs.
    expect(sanitizeSmartFill({ objective_id: "none" }, CTX)).toEqual({});
    expect(sanitizeSmartFill({ objective_id: null }, CTX)).toEqual({});
  });

  it("trie le bon grain de l'ivraie dans une réponse à moitié fausse", () => {
    expect(
      sanitizeSmartFill(
        {
          priority: "urgent",
          effort: "gigantesque",
          category_ids: ["cat-doc", "cat-nope"],
          objective_id: "obj-absent",
        },
        CTX,
      ),
    ).toEqual({ priority: "urgent", category_ids: ["cat-doc"] });
  });
});

describe("buildSmartFillPrompt", () => {
  it("nomme les catégories et les objectifs avec leurs ids", () => {
    const prompt = buildSmartFillPrompt("minddy", CTX);
    expect(prompt).toContain('"Bug" (id: cat-bug)');
    expect(prompt).toContain('"Refonte v2" (id: obj-v2)');
    expect(prompt).toContain("minddy");
  });

  it("dit explicitement quoi répondre quand le projet n'a ni l'un ni l'autre", () => {
    // A model who is presented with an empty list invents; to whom we say “so
    // it’s empty”, no.
    const prompt = buildSmartFillPrompt("Neuf", { categories: [], objectives: [] });
    expect(prompt).toContain("leave category_ids empty");
    expect(prompt).toContain('objective_id must be "none"');
  });
});

describe("smartFillAnswersToRaw", () => {
  it("replays the answers under the tool-arguments shape", () => {
    const raw = smartFillAnswersToRaw({
      priority: { value: "high", probability: 0.9, confidence: 0.9 },
      effort: { value: "none", probability: null, confidence: null },
      category_ids: { value: ["cat-bug", "cat-tech"], probability: 0.8, confidence: 0.7 },
      objective_id: { value: "obj-v2", probability: 0.9, confidence: 0.9 },
    });
    expect(raw).toEqual({
      priority: "high",
      effort: "none",
      category_ids: ["cat-bug", "cat-tech"],
      objective_id: "obj-v2",
    });
  });

  it("leaves absent what the engine did not answer", () => {
    expect(smartFillAnswersToRaw({})).toEqual({});
    expect(
      smartFillAnswersToRaw({ priority: { value: "low", probability: null, confidence: null } })
    ).toEqual({ priority: "low" });
  });

  it("drops non-textual values and non-textual ids of a multi-choice", () => {
    // Jev never produces these for those keys, but the adapter is tolerant on
    // the shape and the sanitizer stays the judge of everything else.
    const raw = smartFillAnswersToRaw({
      priority: { value: 3, probability: null, confidence: null },
      category_ids: {
        value: ["cat-bug", 42, null] as unknown as string[],
        probability: null,
        confidence: null,
      },
    });
    expect(raw).toEqual({ category_ids: ["cat-bug"] });
  });
});

/**
 * THE BRANCH (MIN-563) — `runSmartFill` through the decision layer.
 *
 * The runner and the gates are doubles; what is being pinned down is the
 * AGREEMENT: the spec carries the gathered context, both engines' answers
 * come out through the same sanitizer, and NOTHING — neither an engine down,
 * nor a runner that throws — ever leaves the empty patch. `createIssueForProject`
 * only knows this contract.
 */

const { getAppConfigValuesMock, getUserByIdMock, hasUsageBudgetMock, runDecisionMock, fromMock } = vi.hoisted(() => ({
  getAppConfigValuesMock: vi.fn<() => Promise<Record<string, string | null>>>(),
  getUserByIdMock: vi.fn(),
  hasUsageBudgetMock: vi.fn<() => Promise<boolean>>(),
  runDecisionMock: vi.fn<(spec: unknown, input: unknown) => Promise<DecisionOutcome | null>>(),
  fromMock: vi.fn<(table: string) => unknown>(),
}));

vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: getAppConfigValuesMock,
}));
vi.mock("@/lib/server/usage", () => ({
  hasUsageBudget: hasUsageBudgetMock,
}));
vi.mock("@/lib/server/decisions/runner", () => ({
  runDecision: runDecisionMock,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: fromMock,
    auth: { admin: { getUserById: getUserByIdMock } },
  }),
}));

const DB_CATEGORIES = [
  { id: "cat-bug", project_id: "project-1", name: "Bug" },
  { id: "cat-feat", project_id: "project-1", name: "Feature" },
];
const DB_OBJECTIVES = [{ id: "obj-v2", project_id: "project-1", name: "Refonte v2", description: null, status: "in_progress" }];

/** A PostgREST select chain reduced to what `gatherContext` touches: the
 * chained filters are ignored, the await resolves the rows of the table. */
function queryReturning(rows: unknown[], error: { message: string } | null = null): unknown {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.in = () => query;
  query.order = () => query;
  query.maybeSingle = async () => ({ data: rows[0] ?? null, error });
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error }).then(onFulfilled);
  return query;
}

function outcome(answers: DecisionAnswers, engine: DecisionOutcome["engine"] = "jev"): DecisionOutcome {
  return { engine, answers, confidence: 0.9, fallbackReason: null };
}

describe("runSmartFill — decision layer", () => {
  beforeEach(() => {
    getAppConfigValuesMock.mockReset().mockResolvedValue({});
    getUserByIdMock.mockReset().mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    hasUsageBudgetMock.mockReset().mockResolvedValue(true);
    runDecisionMock.mockReset().mockResolvedValue(null);
    fromMock.mockReset().mockImplementation((table: string) =>
      queryReturning(table === "categories" ? DB_CATEGORIES : DB_OBJECTIVES)
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const run = () =>
    runSmartFill({
      projectId: "project-1",
      projectName: "minddy",
      billToUserId: "user-1",
      title: "Fix the flaky test",
      description: "It fails on CI once in five runs.",
    });

  it("passes through the runner and sanitizes the JEV answers like any other", async () => {
    runDecisionMock.mockResolvedValue(
      outcome({
        priority: { value: "high", probability: 0.9, confidence: 0.9 },
        effort: { value: "m", probability: 0.8, confidence: 0.8 },
        category_ids: { value: ["cat-bug", "cat-inventée"], probability: 0.8, confidence: 0.7 },
        objective_id: { value: "none", probability: 0.9, confidence: 0.9 },
      })
    );
    await expect(run()).resolves.toEqual({
      priority: "high",
      effort: "m",
      category_ids: ["cat-bug"],
    });
  });

  it("passes through the runner and sanitizes the LLM answers the same way", async () => {
    runDecisionMock.mockResolvedValue(
      outcome(
        {
          priority: { value: "medium", probability: null, confidence: null },
          effort: { value: "none", probability: null, confidence: null },
        },
        "llm"
      )
    );
    await expect(run()).resolves.toEqual({ priority: "medium", effort: null });
  });

  it("builds the spec from the gathered context and bills THE ACTOR", async () => {
    runDecisionMock.mockResolvedValue(null);
    await run();
    const [spec, input] = runDecisionMock.mock.calls[0] as [
      { useCase: string; state: Record<string, unknown> },
      Record<string, unknown>,
    ];
    expect(spec.useCase).toBe("smart_fill");
    expect(spec.state).toMatchObject({
      project: "minddy",
      issue: { title: "Fix the flaky test" },
      categories: DB_CATEGORIES.map(({ id, name }) => ({ id, name })),
      objectives: DB_OBJECTIVES.map(({ id, name, status }) => ({ id, name, status })),
    });
    expect(input).toEqual({ billTo: { userId: "user-1" }, projectId: "project-1" });
  });

  it("leaves the patch empty when BOTH engines fail — the ticket is born as it was written", async () => {
    runDecisionMock.mockResolvedValue(null);
    await expect(run()).resolves.toEqual({});
  });

  it("does not send a partial objective context to the model when the read fails", async () => {
    fromMock.mockImplementation((table: string) =>
      queryReturning(table === "categories" ? DB_CATEGORIES : DB_OBJECTIVES,
        table === "objectives" ? { message: "Database unavailable" } : null)
    );
    await expect(run()).resolves.toEqual({});
    expect(runDecisionMock).not.toHaveBeenCalled();
  });

  it("leaves the patch empty when the outcome carries no usable answer", async () => {
    runDecisionMock.mockResolvedValue(outcome({}));
    await expect(run()).resolves.toEqual({});
  });

  it("skips everything when the flag is off — no budget read, no runner call", async () => {
    getAppConfigValuesMock.mockResolvedValue({ smart_fill_enabled: "false" });
    await expect(run()).resolves.toEqual({});
    expect(hasUsageBudgetMock).not.toHaveBeenCalled();
    expect(runDecisionMock).not.toHaveBeenCalled();
  });

  it("skips everything when the budget is dry — no runner call", async () => {
    hasUsageBudgetMock.mockResolvedValue(false);
    await expect(run()).resolves.toEqual({});
    expect(runDecisionMock).not.toHaveBeenCalled();
  });

  it("never calls anyone without an actor: an expense that cannot be attributed is not incurred", async () => {
    await expect(
      runSmartFill({
        projectId: "project-1",
        projectName: "minddy",
        billToUserId: null,
        title: "Fix the flaky test",
        description: null,
      })
    ).resolves.toEqual({});
    expect(getAppConfigValuesMock).not.toHaveBeenCalled();
  });

  it("never calls anyone for an empty title", async () => {
    await expect(
      runSmartFill({
        projectId: "project-1",
        projectName: "minddy",
        billToUserId: "user-1",
        title: "   ",
        description: null,
      })
    ).resolves.toEqual({});
    expect(runDecisionMock).not.toHaveBeenCalled();
  });

  it("swallows a runner crash into the empty patch — the creation is never blocked", async () => {
    runDecisionMock.mockRejectedValue(new Error("network down"));
    await expect(run()).resolves.toEqual({});
    expect(console.error).toHaveBeenCalled();
  });
});

describe("resolveSmartFillPayer", () => {
  beforeEach(() => {
    getUserByIdMock.mockReset().mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });
    fromMock.mockReset().mockImplementation((table: string) => {
      if (table === "integrations") return queryReturning([{ created_by: "integration-owner" }]);
      if (table === "api_keys") return queryReturning([{ user_id: "mcp-owner" }]);
      if (table === "projects") return queryReturning([{ owner_id: "project-owner" }]);
      return queryReturning([]);
    });
  });

  const resolve = (overrides: Partial<Parameters<typeof resolveSmartFillPayer>[0]> = {}) =>
    resolveSmartFillPayer({
      projectId: "project-1",
      actorId: "user-1",
      status: "backlog",
      ...overrides,
    });

  it("bills direct and Numo-style creations to their actor", async () => {
    await expect(resolve()).resolves.toEqual({ userId: "user-1", scope: "created" });
    expect(getUserByIdMock).toHaveBeenCalledWith("user-1");
  });

  it("bills integrations and MCP agents to the users who created them", async () => {
    await expect(resolve({ actorId: null, integrationId: "integration-1", status: "triage" }))
      .resolves.toEqual({ userId: "integration-owner", scope: "triage" });
    await expect(resolve({ actorId: "request-user", mcpKeyId: "key-1" }))
      .resolves.toEqual({ userId: "mcp-owner", scope: "created" });
  });

  it("bills unattributed triage and promoted feedback to the project owner", async () => {
    await expect(resolve({ actorId: null, status: "triage" }))
      .resolves.toEqual({ userId: "project-owner", scope: "triage" });
    await expect(resolve({ actorId: "member-1", ownerBilledTriage: true }))
      .resolves.toEqual({ userId: "project-owner", scope: "triage" });
  });

  it("does not let a promoting member override the owner's triage opt-out", async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { smart_fill_triage: false } } },
      error: null,
    });

    await expect(
      resolve({
        actorId: "member-1",
        explicit: true,
        ownerBilledTriage: true,
      }),
    ).resolves.toBeNull();
    await expect(
      resolve({
        actorId: "project-owner",
        explicit: true,
        ownerBilledTriage: true,
      }),
    ).resolves.toEqual({ userId: "project-owner", scope: "triage" });
  });

  it("does not bill unattributed non-triage or excluded system copies", async () => {
    await expect(resolve({ actorId: null })).resolves.toBeNull();
    await expect(resolve({ excluded: true })).resolves.toBeNull();
  });

  it("honors the master switch and independent automatic scope opt-outs", async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { smart_fill_created: false } } },
      error: null,
    });
    await expect(resolve()).resolves.toBeNull();
    await expect(resolve({ explicit: true })).resolves.toEqual({
      userId: "user-1",
      scope: "created",
    });

    getUserByIdMock.mockResolvedValue({
      data: { user: { user_metadata: { smart_fill: false } } },
      error: null,
    });
    await expect(resolve({ explicit: true })).resolves.toBeNull();
  });

  it("honors a per-ticket opt-out before reading provenance", async () => {
    await expect(resolve({ explicit: false })).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });
});
