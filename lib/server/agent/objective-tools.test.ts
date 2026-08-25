import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Code Agent OBJECTIVE Tools (MIN-287). What these cases hold:
 * - RESOLUTION by name as well as by id — this is what the model copies -,
 * and the refusal which NAMES the candidates when a name is ambiguous;
 * - PINING to the run project: shared cores (`updateObjective`,
 * `addCommentToObjective`) solve the project from the goal, so an id
 * from another project would pass there — it must die before them, not after ;
 * - the effort-weighted PROGRESSION with partial status credit, the same
 * as the UI bar and as `minddy_list_objectives`. Three readers who
 * would give three percentages of the same objective, that's three truths.
 *
 * The writing cores are spied on (they touch the base, events and
 * notifications); everything that is read goes through a fake Supabase which REALLY applies
 * its filters — otherwise the pinning would say nothing.
 */

const OBJ_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJ_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJ_FOREIGN = "ffffffff-ffff-4fff-8fff-ffffffffffff";
/** Two objectives of the SAME project with the same name: the case where the name ne
 * does not decide, and where the tool must give up rather than choose. */
const OBJ_TWIN_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OBJ_TWIN_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
/** A name that contains a JOKER of `LIKE`, and a neighbor that this wildcard catches:
 * the name is text, and "%" is a character like any other. */
const OBJ_PERCENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OBJ_PERCENT_NEIGHBOUR = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";

const OBJECTIVES = [
  {
    id: OBJ_A,
    project_id: "proj-1",
    name: "Refonte du board",
    description: `${"x".repeat(500)}FIN`,
    status: "in_progress",
    lead_user_id: null,
    target_date: "2026-09-30",
    created_at: "2026-01-01",
  },
  {
    id: OBJ_B,
    project_id: "proj-1",
    name: "Vide",
    description: null,
    status: "planned",
    lead_user_id: null,
    target_date: null,
    created_at: "2026-01-02",
  },
  {
    id: OBJ_FOREIGN,
    project_id: "proj-2",
    name: "Objectif d'ailleurs",
    description: null,
    status: "planned",
    lead_user_id: null,
    target_date: null,
    created_at: "2026-01-03",
  },
  {
    id: OBJ_TWIN_1,
    project_id: "proj-1",
    name: "Doublon",
    description: null,
    status: "planned",
    lead_user_id: null,
    target_date: null,
    created_at: "2026-01-04",
  },
  {
    id: OBJ_TWIN_2,
    project_id: "proj-1",
    name: "Doublon",
    description: null,
    status: "planned",
    lead_user_id: null,
    target_date: null,
    created_at: "2026-01-05",
  },
  {
    id: OBJ_PERCENT,
    project_id: "proj-1",
    name: "Offline 100% du board",
    description: null,
    status: "planned",
    lead_user_id: null,
    target_date: null,
    created_at: "2026-01-06",
  },
  {
    id: OBJ_PERCENT_NEIGHBOUR,
    project_id: "proj-1",
    name: "Offline 100 pour cent du board",
    description: null,
    status: "planned",
    lead_user_id: null,
    target_date: null,
    created_at: "2026-01-07",
  },
];

/** Two OBJ_A tickets: one `done` in xs (1 point), one `todo` in xl (8 points).
 * Weighted, that's 1/9 → 11%; in gross accounts it would be 50%. This is
 * exactly the gap that shared computing serves to not reintroduce. */
const ISSUES = [
  {
    id: "i1",
    number: 1,
    project_id: "proj-1",
    objective_id: OBJ_A,
    title: "Fini",
    status: "done",
    priority: "medium",
    effort: "xs",
    assignee_id: null,
  },
  {
    id: "i2",
    number: 2,
    project_id: "proj-1",
    objective_id: OBJ_A,
    title: "À faire",
    status: "todo",
    priority: "high",
    effort: "xl",
    assignee_id: null,
  },
  // A ticket from another project, on an objective elsewhere: it should not
  // count in no progress of proj-1.
  {
    id: "i3",
    number: 3,
    project_id: "proj-2",
    objective_id: OBJ_FOREIGN,
    title: "Ailleurs",
    status: "todo",
    priority: "none",
    effort: "m",
    assignee_id: null,
  },
];

const COMMENTS = [
  {
    id: "c1",
    objective_id: OBJ_A,
    author_id: "user-1",
    body: "Une note d'équipe.",
    parent_id: null,
    via_assistant: false,
    created_at: "2026-02-01",
  },
];

const TABLES: Record<string, Record<string, unknown>[]> = {
  objectives: OBJECTIVES,
  issues: ISSUES,
  comments: COMMENTS,
  attachments: [
    {
      id: "objective-link-1",
      objective_id: OBJ_A,
      comment_id: null,
      kind: "link",
      url: "http://169.254.169.254/latest/meta-data",
      file_name: "Deployment reference",
    },
  ],
};

/**
 * False Supabase: `select().is().eq().ilike().not().order()`, terminated by
 * `maybeSingle()` or by a `await` on the query itself (the lists). The
 * filters are APPLIED — that's the whole point.
 */
vi.mock("@/lib/supabase-service", () => {
  const from = (table: string) => {
    const tests: Array<(row: Record<string, unknown>) => boolean> = [];
    const query: Record<string, unknown> = {};
    const eq = (column: string, value: unknown) => {
      tests.push((row) => (row[column] ?? null) === value);
      return query;
    };
    query.select = () => query;
    query.eq = eq;
    query.is = eq;
    // `ilike` is a PATTERN, not a tie: `%` and `_` are wild cards (and
    // PostgREST translates `*` into `%`). The false must say it, otherwise he
    // would absolve a noun passed as is to the pattern.
    query.ilike = (column: string, value: string) => {
      const pattern = value
        .replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "*" ? "%" : `\\${c}`))
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      const re = new RegExp(`^${pattern}$`, "i");
      tests.push((row) => re.test(String(row[column] ?? "")));
      return query;
    };
    query.not = (column: string, _op: string, value: unknown) => {
      tests.push((row) => (row[column] ?? null) !== value);
      return query;
    };
    query.order = () => query;
    const rows = () => (TABLES[table] ?? []).filter((row) => tests.every((t) => t(row)));
    query.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    query.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve);
    return query;
  };
  return { getServiceClient: () => ({ from }) };
});

vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: async () => new Map(),
  toNamed: (u: unknown) => u,
}));

const { createObjective, updateObjective, addCommentToObjective } = vi.hoisted(() => ({
  createObjective: vi.fn(async () => ({
    ok: true as const,
    objective: { id: "new-obj", name: "Nouveau but", status: "planned" },
  })),
  updateObjective: vi.fn(async () => ({
    ok: true as const,
    objective: { id: OBJ_A, name: "Refonte du board" },
  })),
  addCommentToObjective: vi.fn(async () => ({
    ok: true as const,
    comment: { id: "com-1" },
  })),
}));

vi.mock("@/lib/server/objectives", () => ({ createObjective, updateObjective }));
vi.mock("@/lib/server/add-comment", () => ({ addCommentToObjective }));

import { executeObjectiveTool, type ObjectiveToolContext } from "./objective-tools";

const ctx = (over: Partial<ObjectiveToolContext> = {}): ObjectiveToolContext => ({
  projectId: "proj-1",
  projectKey: "MIN",
  actorId: "user-1",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("list_objectives", () => {
  it("ne rend que les objectifs du projet du run", async () => {
    const out = await executeObjectiveTool(ctx(), "list_objectives", {});
    expect(out.success).toBe(true);
    const { objectives } = out.result as { objectives: Array<{ id: string }> };
    expect(objectives.map((o) => o.id)).toEqual([
      OBJ_A,
      OBJ_B,
      OBJ_TWIN_1,
      OBJ_TWIN_2,
      OBJ_PERCENT,
      OBJ_PERCENT_NEIGHBOUR,
    ]);
    expect(objectives.map((o) => o.id)).not.toContain(OBJ_FOREIGN);
  });

  it("pondère la progression par l'effort, pas par le nombre de tickets", async () => {
    const out = await executeObjectiveTool(ctx(), "list_objectives", {});
    const { objectives } = out.result as {
      objectives: Array<{ id: string; progress: { done: number; total: number; percent: number } }>;
    };
    const a = objectives.find((o) => o.id === OBJ_A)!;
    // 1 point out of 9, and above all NOT 50%: a finished xs is not worth an xl to make.
    expect(a.progress).toEqual({ done: 1, total: 2, percent: 11 });
    // A goal without a ticket is zero, not 100%.
    expect(objectives.find((o) => o.id === OBJ_B)!.progress).toEqual({
      done: 0,
      total: 0,
      percent: 0,
    });
  });

  it("tronque la description : la liste sert à choisir", async () => {
    const out = await executeObjectiveTool(ctx(), "list_objectives", {});
    const { objectives } = out.result as {
      objectives: Array<{ id: string; description: string | null }>;
    };
    const a = objectives.find((o) => o.id === OBJ_A)!;
    expect(a.description).toContain("truncated");
    expect(a.description).not.toContain("FIN");
  });
});

describe("read_objective", () => {
  it("ouvre un objectif par son NOM, insensible à la casse", async () => {
    const out = await executeObjectiveTool(ctx(), "read_objective", {
      objective: "refonte DU board",
    });
    expect(out.success).toBe(true);
    const result = out.result as {
      objective: { id: string; description: string };
      issues: Array<{ identifier: string }>;
      comments: Array<{ body: string }>;
    };
    expect(result.objective.id).toBe(OBJ_A);
    // The ENTIRE description, unlike the list.
    expect(result.objective.description).toContain("FIN");
    expect(result.issues.map((i) => i.identifier)).toEqual(["MIN-1", "MIN-2"]);
    expect(result.comments).toHaveLength(1);
  });

  it("ouvre un objectif par son id", async () => {
    const out = await executeObjectiveTool(ctx(), "read_objective", { objective: OBJ_A });
    expect(out.success).toBe(true);
    expect((out.result as { objective: { name: string } }).objective.name).toBe(
      "Refonte du board",
    );
  });

  it("keeps raw link destinations out of objective resource summaries", async () => {
    const out = await executeObjectiveTool(ctx(), "read_objective", { objective: OBJ_A });

    expect(out.success).toBe(true);
    expect(out.result).toMatchObject({
      objective: {
        resources: [
          {
            id: "objective-link-1",
            kind: "link",
            title: "Deployment reference",
          },
        ],
      },
    });
    expect(JSON.stringify(out.result)).not.toContain("169.254.169.254");
  });

  it("refuse un objectif d'un AUTRE projet", async () => {
    const out = await executeObjectiveTool(ctx(), "read_objective", {
      objective: OBJ_FOREIGN,
    });
    expect(out.success).toBe(false);
    expect(String((out.result as { error: string }).error)).toMatch(/not found in this project/);
  });

  it("nomme les candidats quand un nom est ambigu, plutôt que d'en choisir un", async () => {
    const out = await executeObjectiveTool(ctx(), "read_objective", { objective: "Doublon" });
    expect(out.success).toBe(false);
    const error = String((out.result as { error: string }).error);
    expect(error).toContain(OBJ_TWIN_1);
    expect(error).toContain(OBJ_TWIN_2);
  });

  // A name is TEXT: `%`, `_` and `*` are characters there. Solved by a
  // motif `LIKE`, ils deviennent des jokers — l'un rend ambigu un nom qui ne
  // is not, the other silently attaches to the wrong objective.
  it("traite un nom comme du texte, jokers de LIKE compris", async () => {
    const exact = await executeObjectiveTool(ctx(), "read_objective", {
      objective: "Offline 100% du board",
    });
    expect(exact.success).toBe(true);
    expect((exact.result as { objective: { id: string } }).objective.id).toBe(OBJ_PERCENT);

    const wildcard = await executeObjectiveTool(ctx(), "read_objective", {
      objective: "Vid_",
    });
    expect(wildcard.success).toBe(false);
  });

  it("renvoie vers list_objectives sur un nom inconnu", async () => {
    const out = await executeObjectiveTool(ctx(), "read_objective", { objective: "Inexistant" });
    expect(out.success).toBe(false);
    expect(String((out.result as { error: string }).error)).toMatch(/list_objectives/);
  });
});

describe("create_objective", () => {
  it("écrit par le noyau partagé, au nom du lanceur et via l'assistant", async () => {
    const out = await executeObjectiveTool(ctx(), "create_objective", {
      name: "Nouveau but",
      description: "Ce qu'on cherche à atteindre.",
    });
    expect(out.success).toBe(true);
    expect(createObjective).toHaveBeenCalledWith({
      projectId: "proj-1",
      actorId: "user-1",
      viaAssistant: true,
      input: { name: "Nouveau but", description: "Ce qu'on cherche à atteindre." },
    });
    // An objective without a ticket has a bar stuck at zero: tell the model
    // is part of the result, otherwise no one attaches.
    expect(JSON.stringify(out.result)).toMatch(/attach its issues|update_issue/i);
  });

  it("refuse un statut hors enum, sans rien écrire", async () => {
    const out = await executeObjectiveTool(ctx(), "create_objective", {
      name: "But",
      status: "shipped",
    });
    expect(out.success).toBe(false);
    expect(createObjective).not.toHaveBeenCalled();
  });

  it("refuse un run sans propriétaire", async () => {
    const out = await executeObjectiveTool(ctx({ actorId: null }), "create_objective", {
      name: "But",
    });
    expect(out.success).toBe(false);
    expect(createObjective).not.toHaveBeenCalled();
  });
});

describe("update_objective", () => {
  it("écrit les seuls champs envoyés, sur l'objectif résolu", async () => {
    const out = await executeObjectiveTool(ctx(), "update_objective", {
      objective: "Refonte du board",
      status: "done",
    });
    expect(out.success).toBe(true);
    expect(updateObjective).toHaveBeenCalledWith({
      objectiveId: OBJ_A,
      actorId: "user-1",
      input: { status: "done" },
      viaAssistant: true,
    });
    expect(out.result).toMatchObject({ changed: ["status"] });
  });

  it("refuse un appel sans aucun champ", async () => {
    const out = await executeObjectiveTool(ctx(), "update_objective", { objective: OBJ_A });
    expect(out.success).toBe(false);
    expect(updateObjective).not.toHaveBeenCalled();
  });

  // The kernel resolves the project FROM the goal: without this pinning, an id
  // another project accessible to the launcher would be written.
  it("n'atteint pas le noyau avec un objectif d'un autre projet", async () => {
    const out = await executeObjectiveTool(ctx(), "update_objective", {
      objective: OBJ_FOREIGN,
      name: "Renommé de force",
    });
    expect(out.success).toBe(false);
    expect(updateObjective).not.toHaveBeenCalled();
  });
});

describe("comment_objective", () => {
  it("poste sur le fil de l'objectif, via le noyau partagé", async () => {
    const out = await executeObjectiveTool(ctx(), "comment_objective", {
      objective: OBJ_A,
      body: "  Le point sur le but.  ",
    });
    expect(out.success).toBe(true);
    expect(addCommentToObjective).toHaveBeenCalledWith({
      objectiveId: OBJ_A,
      actorId: "user-1",
      body: "Le point sur le but.",
      viaAssistant: true,
    });
    expect(out.result).toMatchObject({ comment_id: "com-1" });
  });

  it("refuse un corps vide", async () => {
    const out = await executeObjectiveTool(ctx(), "comment_objective", {
      objective: OBJ_A,
      body: "   ",
    });
    expect(out.success).toBe(false);
    expect(addCommentToObjective).not.toHaveBeenCalled();
  });

  it("refuse un objectif d'un autre projet", async () => {
    const out = await executeObjectiveTool(ctx(), "comment_objective", {
      objective: OBJ_FOREIGN,
      body: "Hors périmètre.",
    });
    expect(out.success).toBe(false);
    expect(addCommentToObjective).not.toHaveBeenCalled();
  });
});
