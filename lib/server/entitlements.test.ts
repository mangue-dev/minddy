import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-133 — la corbeille ne doit RIEN coûter au plan.
 *
 * C'est le piège de tout soft delete : la ligne reste en base, et une garde de
 * plan écrite en « compte les lignes » se met à facturer ce que l'utilisateur
 * croit avoir supprimé. Un compte Free plafonné à 2 projets et 300 tickets se
 * retrouverait bloqué juste après avoir fait le ménage — le pire moment.
 *
 * Ces tests épinglent la seule règle qui vaille : ce qui est à la corbeille est
 * sorti du décompte, tout de suite, sans attendre la purge des 30 jours. Le
 * double Supabase applique donc les filtres pour de vrai, sinon il ne dirait
 * rien de ce que la garde compte vraiment.
 */

interface Row extends Record<string, unknown> {
  id: string;
  owner_id?: string;
  project_id?: string;
  deleted_at?: string | null;
}

let projectRows: Row[] = [];
let issueRows: Row[] = [];
let memberRows: { project_id: string; user_id: string }[] = [];

/** Double de chaîne PostgREST : accumule les filtres, puis compte. */
function table(rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  const query: Record<string, unknown> = {};
  const self = () => query;

  query.select = self;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => (row as Record<string, unknown>)[column] === value);
    return query;
  };
  query.is = (column: string, value: unknown) => {
    filters.push(
      (row) => ((row as Record<string, unknown>)[column] ?? null) === value
    );
    return query;
  };
  // `or("owner_id.eq.X,id.in.(a,b)")` — la seule forme utilisée par la garde.
  query.or = (expression: string) => {
    const owner = /owner_id\.eq\.([^,)]+)/.exec(expression)?.[1];
    const ids = /id\.in\.\(([^)]*)\)/.exec(expression)?.[1];
    const idSet = new Set((ids ?? "").split(",").filter(Boolean));
    filters.push((row) => row.owner_id === owner || idSet.has(row.id));
    return query;
  };
  query.maybeSingle = async () => ({
    data: rows().find((row) => filters.every((f) => f(row))) ?? null,
    error: null,
  });
  // `select(..., { count: "exact", head: true })` est awaité tel quel.
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({
      count: rows().filter((row) => filters.every((f) => f(row))).length,
      error: null,
    }).then(resolve);

  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => {
      if (name === "project_members") {
        return {
          select: () => ({
            eq: async () => ({ data: memberRows, error: null }),
          }),
        };
      }
      return table(() => (name === "projects" ? projectRows : issueRows));
    },
  }),
}));

// Plan Free : 2 projets, 300 tickets par projet.
vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: async () => ({
    plan: { maxProjects: 2, maxIssuesPerProject: 300 },
  }),
}));

vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: async () => true }));

import {
  countAccessibleProjects,
  ensureIssueLimit,
  ensureProjectLimit,
} from "./entitlements";

const OWNER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const TRASHED = "2026-07-01T00:00:00.000Z";

beforeEach(() => {
  projectRows = [];
  issueRows = [];
  memberRows = [];
});

describe("limite de projets", () => {
  it("ne compte pas un projet mis à la corbeille", async () => {
    projectRows = [
      { id: "p1", owner_id: OWNER, deleted_at: null },
      { id: "p2", owner_id: OWNER, deleted_at: TRASHED },
    ];
    await expect(countAccessibleProjects(OWNER)).resolves.toBe(1);
  });

  it("rend sa place à un compte plein dès qu'il en corbeille un", async () => {
    projectRows = [
      { id: "p1", owner_id: OWNER, deleted_at: null },
      { id: "p2", owner_id: OWNER, deleted_at: null },
    ];
    await expect(ensureProjectLimit(OWNER)).rejects.toThrow();

    projectRows[1].deleted_at = TRASHED;
    await expect(ensureProjectLimit(OWNER)).resolves.toBeUndefined();
  });
});

describe("limite de tickets par projet", () => {
  const fill = (n: number, deleted: string | null) =>
    Array.from({ length: n }, (_, i) => ({
      id: `i${deleted ? "d" : ""}${i}`,
      project_id: PROJECT,
      deleted_at: deleted,
    }));

  it("ne compte pas les tickets mis à la corbeille", async () => {
    projectRows = [{ id: PROJECT, owner_id: OWNER, deleted_at: null }];
    issueRows = [...fill(299, null), ...fill(50, TRASHED)];
    await expect(ensureIssueLimit(PROJECT)).resolves.toBeUndefined();
  });

  it("bloque quand le plafond est atteint par des tickets VIVANTS", async () => {
    projectRows = [{ id: PROJECT, owner_id: OWNER, deleted_at: null }];
    issueRows = fill(300, null);
    await expect(ensureIssueLimit(PROJECT)).rejects.toThrow();
  });
});
