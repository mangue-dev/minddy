import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `buildForgeAssigneeIndex` — le pont « octocat » → le membre minddy qui a
 * connecté ce compte-là.
 *
 * Ce que ces tests épinglent n'est pas le rapprochement heureux, mais les deux
 * garde-fous, parce que ce sont eux qui coûtent cher quand ils sautent :
 *
 *  1. **Seuls les MEMBRES du projet** entrent dans l'index. `issues.assignee_id`
 *     porte une FK vers `auth.users`, pas vers `project_members` : assigner un
 *     login connu de minddy mais étranger au projet PASSERAIT en base, et le
 *     ticket atterrirait chez quelqu'un qui ne voit même pas le projet. Rien ne
 *     lèverait, personne ne le verrait.
 *  2. **Rien n'est deviné.** Pas de rapprochement par nom, contrairement à
 *     l'import CSV — ici on a une égalité exacte, et un mauvais assigné coûte
 *     plus cher qu'une absence d'assigné.
 *
 * Le troisième point est plus discret : la table interrogée n'est pas la même
 * selon la forge (`git_user_identities` côté GitHub, `git_connections` côté
 * GitLab, où la connexion OAuth EST l'identité). Se tromper de table rendrait un
 * index vide en silence — donc plus aucun assigné, sans erreur nulle part.
 */

interface Row extends Record<string, unknown> {}

let projectRows: Row[] = [];
let memberRows: Row[] = [];
let identityRows: Row[] = [];
let connectionRows: Row[] = [];
/** Les tables réellement interrogées, dans l'ordre — la sonde du bon aiguillage. */
let queried: string[] = [];
/** Forcer l'échec du lookup d'identités (la branche « on rend un index vide »). */
let failIdentityLookup = false;

/** Double de chaîne PostgREST, réduit à ce que le module touche : `eq`, `in`,
    `select`, et la résolution en tableau ou en ligne unique. */
function table(name: string, rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  const query: Record<string, unknown> = {};

  query.select = () => query;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.in = (column: string, values: unknown[]) => {
    filters.push((row) => values.includes(row[column]));
    return query;
  };

  const resolve = () => {
    queried.push(name);
    if (failIdentityLookup && (name === "git_user_identities" || name === "git_connections")) {
      return { data: null, error: { message: "lookup refused" } };
    }
    return { data: rows().filter((row) => filters.every((f) => f(row))), error: null };
  };

  query.maybeSingle = async () => {
    const result = resolve();
    return { ...result, data: result.data?.[0] ?? null };
  };
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled);
  return query;
}

const TABLES: Record<string, () => Row[]> = {
  projects: () => projectRows,
  project_members: () => memberRows,
  git_user_identities: () => identityRows,
  git_connections: () => connectionRows,
};

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(name, TABLES[name] ?? (() => [])),
  }),
}));

const { buildForgeAssigneeIndex, matchForgeAssignee } = await import(
  "@/lib/server/git/forge-members"
);

const PROJECT = "project-1";
const OWNER = "user-owner";

beforeEach(() => {
  projectRows = [{ id: PROJECT, owner_id: OWNER }];
  memberRows = [];
  identityRows = [];
  connectionRows = [];
  queried = [];
  failIdentityLookup = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("buildForgeAssigneeIndex", () => {
  it("indexe le owner et les membres — le owner n'a pas de ligne project_members", async () => {
    memberRows.push({ project_id: PROJECT, user_id: "user-dev" });
    identityRows.push(
      { provider: "github", user_id: OWNER, account_login: "octocat" },
      { provider: "github", user_id: "user-dev", account_login: "Hubot" },
    );

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.get("octocat")).toBe(OWNER);
    // Indexé en minuscules : la forge n'a pas la même casse d'un endpoint à l'autre.
    expect(index.get("hubot")).toBe("user-dev");
  });

  it("LAISSE DEHORS un login connu de minddy mais étranger au projet", async () => {
    identityRows.push(
      { provider: "github", user_id: OWNER, account_login: "octocat" },
      { provider: "github", user_id: "user-stranger", account_login: "intruder" },
    );

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.has("octocat")).toBe(true);
    expect(index.has("intruder")).toBe(false);
  });

  it("lit git_connections côté GitLab — la connexion OAuth EST l'identité", async () => {
    connectionRows.push({ provider: "gitlab", user_id: OWNER, account_login: "octo-gl" });
    identityRows.push({ provider: "gitlab", user_id: OWNER, account_login: "jamais-lu" });

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "gitlab" });

    expect(index.get("octo-gl")).toBe(OWNER);
    expect(queried).toContain("git_connections");
    expect(queried).not.toContain("git_user_identities");
  });

  it("ne mélange pas les forges : une identité GitLab ne répond pas pour GitHub", async () => {
    identityRows.push({ provider: "gitlab", user_id: OWNER, account_login: "octocat" });

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.size).toBe(0);
  });

  it("premier arrivé, premier servi quand deux comptes déclarent le même login", async () => {
    memberRows.push({ project_id: PROJECT, user_id: "user-dev" });
    identityRows.push(
      { provider: "github", user_id: OWNER, account_login: "octocat" },
      { provider: "github", user_id: "user-dev", account_login: "octocat" },
    );

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.get("octocat")).toBe(OWNER);
  });

  it("rend un index VIDE plutôt que de lever quand le lookup échoue", async () => {
    failIdentityLookup = true;
    identityRows.push({ provider: "github", user_id: OWNER, account_login: "octocat" });

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    // Vide = personne n'est assigné, le comportement d'avant MIN-144. Pas une exception.
    expect(index.size).toBe(0);
  });

  it("n'interroge pas les identités quand le projet n'a personne", async () => {
    projectRows = [];

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.size).toBe(0);
    expect(queried).not.toContain("git_user_identities");
  });
});

describe("matchForgeAssignee", () => {
  const index = new Map([
    ["octocat", "user-owner"],
    ["hubot", "user-dev"],
  ]);

  it("prend le PREMIER assigné reconnu, dans l'ordre de la forge", () => {
    // Les deux forges acceptent plusieurs assignés, minddy un seul.
    expect(matchForgeAssignee(["hubot", "octocat"], index)).toBe("user-dev");
  });

  it("saute ceux qu'on ne reconnaît pas plutôt que de renoncer", () => {
    expect(matchForgeAssignee(["inconnu", "octocat"], index)).toBe("user-owner");
  });

  it("compare hors casse et hors espaces", () => {
    expect(matchForgeAssignee(["  OctoCat "], index)).toBe("user-owner");
  });

  it("rend null quand personne n'est reconnu — jamais un assigné deviné", () => {
    expect(matchForgeAssignee(["inconnu", "autre"], index)).toBeNull();
    expect(matchForgeAssignee([], index)).toBeNull();
  });
});
