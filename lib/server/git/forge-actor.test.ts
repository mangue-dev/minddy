import { beforeEach, expect, it, vi } from "vitest";

/**
 * Ce que la forge répond quand elle refuse le TOKEN, et non le dépôt.
 *
 * Le repli historique envoyait tout échec non-404 sur `read`. Un 401 y devenait
 * donc « compte connecté, droits limités » — la pire phrase possible, servie au
 * PROPRIÉTAIRE du dépôt (« votre compte git ne peut ni fusionner ni résoudre les
 * fils de ce dépôt »), puis un `Bad credentials` nu au premier geste. Trois cas,
 * et le troisième est le garde-fou : 403 doit RESTER un repli sur `read`, sinon
 * un quota d'API épuisé se mettrait à réclamer une réautorisation.
 */

let tokens: string[];
let minted: { token: string; force: boolean }[];
let responses: (() => Response)[];
let probes: string[];

vi.mock("./user-identities", () => ({
  getGithubUserToken: async (_userId: string, opts: { force?: boolean } = {}) => {
    // Une rotation forcée consomme le token suivant ; sans elle, on rend celui
    // qui est en base — exactement le contrat de la vraie fonction.
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

/** Le module garde des caches in-process : chaque cas repart d'un module neuf. */
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

it("répare tout seul un token que la forge refuse, quand la rotation aboutit", async () => {
  tokens = ["mort", "frais"];
  responses = [
    () => json(401, { message: "Bad credentials" }),
    () => json(200, { permissions: { admin: true, push: true, pull: true } }),
  ];
  const resolveForgeActor = await freshResolve();

  const actor = await resolveForgeActor(opts);

  // Le propriétaire du dépôt retrouve son droit de fusionner, sans rien faire.
  expect(actor).toMatchObject({ kind: "actor", token: "frais", capability: "write" });
  expect(minted).toEqual([
    { token: "mort", force: false },
    { token: "frais", force: true },
  ]);
});

it("dit « à réautoriser » plutôt que « lecture seule » quand rien ne peut le sauver", async () => {
  tokens = ["mort"];
  responses = [() => json(401, { message: "Bad credentials" })];
  const resolveForgeActor = await freshResolve();

  const actor = await resolveForgeActor(opts);

  expect(actor).toEqual({ kind: "none", reason: "expired", login: "mangue-dev" });
});

it("ne rejoue pas la rotation pour un token déjà constaté mort", async () => {
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
  // Le second passage mint le token puis s'arrête net : ni probe de plus, ni
  // échange OAuth — le panneau d'une PR repolle toutes les 15 s, à trois ou
  // quatre requêtes le tour.
  expect(minted.length).toBe(before + 1);
  expect(probes.length).toBe(1);
});

it("garde le repli sur `read` pour un 403 — quota, SSO d'organisation", async () => {
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
