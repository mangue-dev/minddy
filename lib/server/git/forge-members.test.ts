import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `buildForgeAssigneeIndex` — the “octocat” bridge → the minddy member who has
 * connected this account.
 *
 * What these tests pinpoint is not the happy rapprochement, but the two
 * safeguards, because that they are the ones who cost a lot when they jump:
 *
 * 1. **Only MEMBERS of the project** enter the index. `issues.assignee_id`
 * carries an FK to `auth.users`, not to `project_members`: assign a
 * login known to minddy but foreign to the project WILL PASS into the database, and the
 * ticket would land with someone who doesn't even see the project. Nothing
 * would be raised, no one would see it.
 * 2. **Nothing is guessed.** No matching by name, unlike
 * CSV import — here we have an exact equality, and a wrong assignment costs
 * more expensive than an absence assigned.
 *
 * The third point is more discreet: the queried table is not the same
 * depending on the forge (`git_user_identities` on the GitHub side, `git_connections` on the
 * GitLab side, where the OAuth connection IS identity). Getting the wrong table would make a
 * index silently empty — so no more assigned, with no errors anywhere.
 */

interface Row extends Record<string, unknown> {}

let projectRows: Row[] = [];
let memberRows: Row[] = [];
let identityRows: Row[] = [];
let connectionRows: Row[] = [];
/** The tables actually queried, in order — the correct referral probe. */
let queried: string[] = [];
/** Force the identity lookup to fail (the “we return an empty index” branch). */
let failIdentityLookup = false;

/** Double PostgREST string, reduced to whatever the module touches: `eq`, `in`,
 `select`, and resolution to array or single row. */
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
    // Indexed in lowercase: the forge does not have the same case from one endpoint to another.
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

    // Empty = no one is assigned, the behavior before MIN-144. Not an exception.
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
    // The two forges accept several assignees, minddy only one.
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
