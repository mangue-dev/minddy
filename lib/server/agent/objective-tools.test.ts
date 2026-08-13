import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tools OBJECTIF de l'agent de code (MIN-287). Ce que ces cas tiennent :
 *  - la RÉSOLUTION par nom autant que par id — c'est ce que le modèle recopie —,
 *    et le refus qui NOMME les candidats quand un nom est ambigu ;
 *  - l'ÉPINGLAGE au projet du run : les noyaux partagés (`updateObjective`,
 *    `addCommentToObjective`) résolvent le projet depuis l'objectif, donc un id
 *    d'un autre projet y passerait — il doit mourir avant eux, pas après ;
 *  - la PROGRESSION pondérée par l'effort avec crédit partiel de statut, la même
 *    que la barre de l'UI et que `minddy_list_objectives`. Trois lecteurs qui
 *    donneraient trois pourcentages du même objectif, c'est trois vérités.
 *
 * Les noyaux d'écriture sont espionnés (ils touchent la base, les événements et
 * les notifications) ; tout ce qui se lit passe par un faux Supabase qui applique
 * VRAIMENT ses filtres — sans quoi l'épinglage ne dirait rien.
 */

const OBJ_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJ_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJ_FOREIGN = "ffffffff-ffff-4fff-8fff-ffffffffffff";
/** Deux objectifs du MÊME projet portant le même nom : le cas où le nom ne
 *  tranche pas, et où le tool doit rendre la main plutôt que choisir. */
const OBJ_TWIN_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OBJ_TWIN_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
/** Un nom qui contient un JOKER de `LIKE`, et un voisin que ce joker attrape :
 *  le nom est du texte, et « % » y est un caractère comme un autre. */
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

/** Deux tickets d'OBJ_A : un `done` en xs (1 point), un `todo` en xl (8 points).
 *  Pondéré, ça fait 1/9 → 11 % ; en comptes bruts ce serait 50 %. C'est
 *  exactement l'écart que le calcul partagé sert à ne pas réintroduire. */
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
  // Un ticket d'un autre projet, sur un objectif d'ailleurs : il ne doit
  // compter dans aucune progression de proj-1.
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
  attachments: [],
};

/**
 * Faux Supabase : `select().is().eq().ilike().not().order()`, terminé par
 * `maybeSingle()` ou par un `await` sur la requête elle-même (les listes). Les
 * filtres sont APPLIQUÉS — c'est tout l'intérêt.
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
    // `ilike` est un MOTIF, pas une égalité : `%` et `_` y sont des jokers (et
    // PostgREST y traduit `*` en `%`). Le faux doit le dire, sans quoi il
    // absoudrait un nom passé tel quel au motif.
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
    // 1 point sur 9, et surtout PAS 50 % : un xs fini ne vaut pas un xl à faire.
    expect(a.progress).toEqual({ done: 1, total: 2, percent: 11 });
    // Un objectif sans ticket est à zéro, pas à 100 %.
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
    // La description ENTIÈRE, contrairement à la liste.
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

  // Un nom est du TEXTE : `%`, `_` et `*` y sont des caractères. Résolus par un
  // motif `LIKE`, ils deviennent des jokers — l'un rend ambigu un nom qui ne
  // l'est pas, l'autre attache silencieusement au mauvais objectif.
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
    // Un objectif sans ticket a une barre bloquée à zéro : le dire au modèle
    // fait partie du résultat, sinon personne ne rattache.
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

  // Le noyau résout le projet DEPUIS l'objectif : sans cet épinglage, un id
  // d'un autre projet accessible au lanceur serait écrit.
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
