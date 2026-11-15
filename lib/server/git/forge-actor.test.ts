import { beforeEach, expect, it, vi } from "vitest";

/**
 * What to answer when the forge rejects the TOKEN, not the repository.
 *
 * The historical fallback sent every non-404 failure to `read`. A 401 thus
 * became "linked account, limited rights", the worst possible message, served
 * to the repository's OWNER ("your Git account can neither merge nor resolve
 * threads in this repository"), followed by a bare `Bad credentials` on the
 * first action. Three cases, and the third is the safeguard: a 403 must STAY a
 * fallback to `read`, otherwise an exhausted API quota would start demanding
 * reauthorization.
 */

let tokens: string[];
let minted: { token: string; force: boolean }[];
let responses: (() => Response)[];
let probes: string[];

vi.mock("./user-identities", () => ({
  getGithubUserToken: async (_userId: string, opts: { force?: boolean } = {}) => {
    // A forced rotation consumes the next token; otherwise the stored one is
    // returned, exactly the real function's contract.
    const token = opts.force && tokens.length > 1 ? tokens[1] : tokens[0];
    if (opts.force && tokens.length > 1) tokens = tokens.slice(1);
    minted.push({ token, force: !!opts.force });
    return { token, login: "mangue-dev", avatarUrl: null };
  },
}));

vi.mock("./connections", () => ({ findReusableConnection: async () => null }));
vi.mock("./gitlab-app", () => ({ getGitlabAccessToken: async () => "gitlab-token" }));

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The module keeps in-process caches: each case starts from a fresh module. */
async function freshResolve() {
  vi.resetModules();
  const mod = await import("./forge-actor");
  return mod.resolveForgeActor;
}

beforeEach(() => {
  minted = [];
  probes = [];
  vi.stubGlobal("fetch", async (url: string | URL) => {
    probes.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next();
  });
});

const opts = {
  userId: "u1",
  provider: "github" as const,
  repoFullName: "mangue-dev/minddy-issues",
};

it("repairs a token rejected by the forge when rotation succeeds", async () => {
  tokens = ["mort", "frais"];
  responses = [
    () => json(401, { message: "Bad credentials" }),
    () => json(200, { permissions: { admin: true, push: true, pull: true } }),
  ];
  const resolveForgeActor = await freshResolve();

  const actor = await resolveForgeActor(opts);

  // The repository owner gets their merge right back without doing anything.
  expect(actor).toMatchObject({ kind: "actor", token: "frais", capability: "write" });
  expect(minted).toEqual([
    { token: "mort", force: false },
    { token: "frais", force: true },
  ]);
});

it("says \"reauthorize\" rather than \"read-only\" when nothing can save it", async () => {
  tokens = ["mort"];
  responses = [() => json(401, { message: "Bad credentials" })];
  const resolveForgeActor = await freshResolve();

  const actor = await resolveForgeActor(opts);

  expect(actor).toEqual({ kind: "none", reason: "expired", login: "mangue-dev" });
});

it("does not replay rotation for a token already known to be dead", async () => {
  tokens = ["mort"];
  responses = [
    () => json(401, { message: "Bad credentials" }),
    () => json(401, { message: "Bad credentials" }),
  ];
  const resolveForgeActor = await freshResolve();

  await resolveForgeActor(opts);
  const before = minted.length;
  const actor = await resolveForgeActor(opts);

  expect(actor).toMatchObject({ kind: "none", reason: "expired" });
  // The second pass mints the token and stops right there: no new probe, no
  // OAuth exchange. A PR panel polls every 15 s, with three or four requests
  // per round.
  expect(minted.length).toBe(before + 1);
  expect(probes.length).toBe(1);
});

it("keeps the `read` fallback for a 403 — quota, organization SSO", async () => {
  tokens = ["vivant"];
  responses = [() => json(403, { message: "API rate limit exceeded" })];
  const resolveForgeActor = await freshResolve();

  const actor = await resolveForgeActor(opts);

  expect(actor).toMatchObject({ kind: "actor", capability: "read" });
  expect(minted).toEqual([{ token: "vivant", force: false }]);
});

it("keeps the 404: the forge hides the existence of a repository the user cannot see", async () => {
  tokens = ["vivant"];
  responses = [() => json(404, { message: "Not Found" })];
  const resolveForgeActor = await freshResolve();

  const actor = await resolveForgeActor(opts);

  expect(actor).toEqual({ kind: "none", reason: "noRepoAccess", login: "mangue-dev" });
});
