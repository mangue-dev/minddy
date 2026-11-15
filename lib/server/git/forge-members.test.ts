import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `buildForgeAssigneeIndex` — the bridge from “octocat” to the minddy member
 * who linked that account.
 *
 * These tests pin down not the happy match but the two safeguards, because
 * they are the ones that cost the most when they fail:
 *
 * 1. **Only project MEMBERS** enter the index. `issues.assignee_id` has an FK
 *    to `auth.users`, not to `project_members`: assigning a login known to
 *    minddy but foreign to the project WOULD pass in the database, and the
 *    issue would land with someone who cannot even see the project. Nothing
 *    would throw, and nobody would notice.
 * 2. **Nothing is guessed.** No name matching, unlike the CSV import: this is
 *    an exact equality, and a wrong assignment costs more than a missing one.
 *
 * The third point is subtler: the queried table depends on the forge
 * (`git_user_identities` for GitHub, `git_connections` for GitLab, where the
 * OAuth connection IS the identity). Querying the wrong table would leave the
 * index silently empty, so nothing would be assigned and no error would show.
 */

interface Row extends Record<string, unknown> {}

let projectRows: Row[] = [];
let memberRows: Row[] = [];
let identityRows: Row[] = [];
let connectionRows: Row[] = [];
/** The tables actually queried, in order: the probe for correct routing. */
let queried: string[] = [];
/** Forces the identity lookup to fail (the “return an empty index” branch). */
let failIdentityLookup = false;

/** PostgREST chain double, reduced to what the module touches: `eq`, `in`,
 `select`, and resolution to an array or a single row. */
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
  it("indexes the owner and the members; the owner has no project_members row", async () => {
    memberRows.push({ project_id: PROJECT, user_id: "user-dev", role: "member" });
    identityRows.push(
      { provider: "github", user_id: OWNER, account_login: "octocat" },
      { provider: "github", user_id: "user-dev", account_login: "Hubot" },
    );

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.get("octocat")).toBe(OWNER);
    // Indexed in lowercase: the forge does not keep the same case across endpoints.
    expect(index.get("hubot")).toBe("user-dev");
  });

  it("leaves out a reader: readers are never assignees nor forge @numo triggers (MIN-693)", async () => {
    memberRows.push({ project_id: PROJECT, user_id: "user-reader", role: "reader" });
    identityRows.push(
      { provider: "github", user_id: OWNER, account_login: "octocat" },
      { provider: "github", user_id: "user-reader", account_login: "reader" },
    );

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.has("octocat")).toBe(true);
    expect(index.has("reader")).toBe(false);
  });

  it("LEAVES OUT a login known to minddy but foreign to the project", async () => {
    identityRows.push(
      { provider: "github", user_id: OWNER, account_login: "octocat" },
      { provider: "github", user_id: "user-stranger", account_login: "intruder" },
    );

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.has("octocat")).toBe(true);
    expect(index.has("intruder")).toBe(false);
  });

  it("reads git_connections for GitLab, where the OAuth connection IS the identity", async () => {
    connectionRows.push({ provider: "gitlab", user_id: OWNER, account_login: "octo-gl" });
    identityRows.push({ provider: "gitlab", user_id: OWNER, account_login: "jamais-lu" });

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "gitlab" });

    expect(index.get("octo-gl")).toBe(OWNER);
    expect(queried).toContain("git_connections");
    expect(queried).not.toContain("git_user_identities");
  });

  it("does not mix forges: a GitLab identity does not answer for GitHub", async () => {
    identityRows.push({ provider: "gitlab", user_id: OWNER, account_login: "octocat" });

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.size).toBe(0);
  });

  it("first come, first served when two accounts declare the same login", async () => {
    memberRows.push({ project_id: PROJECT, user_id: "user-dev" });
    identityRows.push(
      { provider: "github", user_id: OWNER, account_login: "octocat" },
      { provider: "github", user_id: "user-dev", account_login: "octocat" },
    );

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    expect(index.get("octocat")).toBe(OWNER);
  });

  it("returns an EMPTY index rather than throwing when the lookup fails", async () => {
    failIdentityLookup = true;
    identityRows.push({ provider: "github", user_id: OWNER, account_login: "octocat" });

    const index = await buildForgeAssigneeIndex({ projectId: PROJECT, provider: "github" });

    // Empty = nobody is assigned, the behavior before MIN-144. Not an exception.
    expect(index.size).toBe(0);
  });

  it("does not query identities when the project has nobody", async () => {
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

  it("takes the FIRST recognized assignee, in the forge's order", () => {
    // Both forges accept several assignees, minddy only one.
    expect(matchForgeAssignee(["hubot", "octocat"], index)).toBe("user-dev");
  });

  it("skips unrecognized assignees rather than giving up", () => {
    expect(matchForgeAssignee(["inconnu", "octocat"], index)).toBe("user-owner");
  });

  it("compares ignoring case and surrounding spaces", () => {
    expect(matchForgeAssignee(["  OctoCat "], index)).toBe("user-owner");
  });

  it("returns null when nobody is recognized, never a guessed assignee", () => {
    expect(matchForgeAssignee(["inconnu", "autre"], index)).toBeNull();
    expect(matchForgeAssignee([], index)).toBeNull();
  });
});
