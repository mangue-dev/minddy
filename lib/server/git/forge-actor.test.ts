import { beforeEach, expect, it, vi } from "vitest";

/**
 * What the forge responds to when it refuses the TOKEN, not the deposit.
 *
 * Historical fallback sent any non-404 failure to `read`. A 401 became
 * therefore "connected account, limited rights" - the worst possible sentence, served to the
 * OWNER of the repository ("your git account can neither merge nor resolve the
 * children of this repository"), then a bare `Bad credentials` at the first gesture. Three cases,
 * and the third is the safeguard: 403 must REMAIN a fallback to `read`, otherwise
 * an exhausted API quota would start demanding reauthorization.
 */

let tokens: string[];
let minted: { token: string; force: boolean }[];
let responses: (() => Response)[];
let probes: string[];

vi.mock("./user-identities", () => ({
  getGithubUserToken: async (_userId: string, opts: { force?: boolean } = {}) => {
    // A forced rotation consumes the next token; without it, we return the one
    // which is in base — exactly the contract of the real function.
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

/** The module keeps in-process caches: each case starts from a new module. */
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

  // The owner of the repository regains his right to merge, without doing anything.
  expect(actor).toMatchObject({ kind: "actor", token: "frais", capability: "write" });
  expect(minted).toEqual([
    { token: "mort", force: false },
    { token: "frais", force: true },
  ]);
});

it("says « reauthorize » rather than « read-only » when nothing can save it", async () => {
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
  // The second pass mints the token then stops abruptly: no more probe, no
  // OAuth exchange — the panel of a PR repolles every 15 s, at three or
  // four requests per turn.
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

it("garde le 404 : la forge cache l'existence d'un dépôt qu'on ne voit pas", async () => {
  tokens = ["vivant"];
  responses = [() => json(404, { message: "Not Found" })];
  const resolveForgeActor = await freshResolve();

  const actor = await resolveForgeActor(opts);

  expect(actor).toEqual({ kind: "none", reason: "noRepoAccess", login: "mangue-dev" });
});
