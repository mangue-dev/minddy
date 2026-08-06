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
 *
 * MIN-199 y ajoute le plafond d'INVITÉS par projet, qui a le même piège sous une
 * autre forme : ce qu'on compte n'est pas seulement ce qui existe (les membres)
 * mais aussi ce qui est promis (les invitations en attente).
 */

interface Row extends Record<string, unknown> {
  id: string;
  owner_id?: string;
  project_id?: string;
  user_id?: string;
  status?: string;
  deleted_at?: string | null;
}

let projectRows: Row[] = [];
let issueRows: Row[] = [];
let memberRows: Row[] = [];
let invitationRows: Row[] = [];

/** Le plan que la garde lit — réécrit par les tests qui changent de palier. */
let plan: {
  maxProjects: number | null;
  maxIssuesPerProject: number | null;
  maxMembersPerProject: number | null;
};

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
  query.gt = (column: string, value: unknown) => {
    filters.push(
      (row) =>
        Date.parse(String((row as Record<string, unknown>)[column])) >
        Date.parse(String(value))
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
  // Un `select()` est awaité tel quel, avec ou sans `{ count: "exact", head }` :
  // on rend les deux formes, la garde ne lit que celle qui la concerne.
  query.then = (resolve: (value: unknown) => unknown) => {
    const matching = rows().filter((row) => filters.every((f) => f(row)));
    return Promise.resolve({
      data: matching,
      count: matching.length,
      error: null,
    }).then(resolve);
  };

  return query;
}

const TABLES: Record<string, () => Row[]> = {
  projects: () => projectRows,
  issues: () => issueRows,
  project_members: () => memberRows,
  project_invitations: () => invitationRows,
};

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(TABLES[name] ?? (() => [])),
  }),
}));

vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: async () => ({ plan }),
}));

vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: async () => true }));

import {
  countAccessibleProjects,
  ensureIssueLimit,
  ensureMemberSlotAvailable,
  ensureProjectLimit,
} from "./entitlements";

const OWNER = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const TRASHED = "2026-07-01T00:00:00.000Z";

beforeEach(() => {
  projectRows = [];
  issueRows = [];
  memberRows = [];
  invitationRows = [];
  // Plan Free : 2 projets, 300 tickets par projet, 2 invités par projet.
  plan = { maxProjects: 2, maxIssuesPerProject: 300, maxMembersPerProject: 2 };
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

describe("plafond d'invités par projet (MIN-199)", () => {
  const member = (n: number): Row => ({
    id: `m${n}`,
    project_id: PROJECT,
    user_id: `u${n}`,
  });
  // `expires_at` est NOT NULL en base (MIN-197) : le double le modélise, sinon
  // il testerait une ligne qui ne peut pas exister.
  const LIVE = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const DEAD = new Date(Date.now() - 86_400_000).toISOString();
  const invitation = (n: number, status: string, expires = LIVE): Row => ({
    id: `inv${n}`,
    project_id: PROJECT,
    status,
    expires_at: expires,
  });

  it("laisse passer les deux premiers invités du plan gratuit", async () => {
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();

    memberRows = [member(1)];
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();

    memberRows = [member(1), member(2)];
    await expect(ensureMemberSlotAvailable(OWNER, PROJECT)).rejects.toThrow();
  });

  it("compte une invitation EN ATTENTE comme une place prise", async () => {
    memberRows = [member(1)];
    invitationRows = [invitation(1, "pending")];
    await expect(ensureMemberSlotAvailable(OWNER, PROJECT)).rejects.toThrow();
  });

  it("rend sa place à une invitation annulée ou acceptée", async () => {
    memberRows = [member(1)];
    invitationRows = [invitation(1, "cancelled"), invitation(2, "accepted")];
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();
  });

  // Rien ne repasse une invitation périmée à un autre statut : elle reste
  // `pending` jusqu'à la purge des 90 jours. Si elle comptait, une place du plan
  // resterait prise deux mois par une invitation que plus personne ne peut
  // accepter — le piège de MIN-133 (la corbeille qui coûte) sous une autre forme.
  it("rend sa place à une invitation PÉRIMÉE, restée pending", async () => {
    memberRows = [member(1)];
    invitationRows = [invitation(1, "pending", DEAD)];
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();
  });

  it("ne compte que le projet visé", async () => {
    memberRows = [
      { id: "m1", project_id: "autre-projet", user_id: "u1" },
      { id: "m2", project_id: "autre-projet", user_id: "u2" },
    ];
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();
  });

  it("ne compte jamais rien quand le plan est illimité (Pro)", async () => {
    plan.maxMembersPerProject = null;
    memberRows = Array.from({ length: 50 }, (_, i) => member(i));
    await expect(
      ensureMemberSlotAvailable(OWNER, PROJECT)
    ).resolves.toBeUndefined();
  });

  it("ne rétrograde pas un projet déjà au-dessus de son plafond", async () => {
    // Abonnement expiré : les 4 membres restent, seule la 5e invitation est
    // refusée — la garde ne s'exécute qu'à l'invitation, jamais rétroactivement.
    memberRows = [member(1), member(2), member(3), member(4)];
    await expect(ensureMemberSlotAvailable(OWNER, PROJECT)).rejects.toThrow();
    expect(memberRows).toHaveLength(4);
  });
});
