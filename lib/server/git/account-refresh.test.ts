import { beforeEach, expect, it, vi } from "vitest";

/**
 * MIN-154, moitié 2 : le garde anti-rafales de `refreshForgeAccountNames`.
 *
 * Ce qu'il doit tenir tient en deux phrases. **Un seul aller-retour de forge**
 * par fenêtre — la page des réglages monte ses deux requêtes ensemble
 * (`useGitIdentitiesQuery` + `useGitConnectionsQuery`), et ouvrir l'onglet ne
 * doit pas rejouer trois appels. Mais **les deux requêtes lisent après
 * l'écriture** : un garde qui se contenterait de dater la passe laisserait la
 * seconde retourner en base avant que la première y ait écrit, et le nom périmé
 * s'afficherait sur le chargement même qui devait le corriger.
 *
 * La forge est tenue en laisse ici (`forgeAnswer`) : c'est la seule façon de
 * placer la seconde requête PENDANT la première, là où le bug vivait.
 */

let stored: string;
let forgeCalls: number;
let forgeAnswer: Promise<void>;
let releaseForge: () => void;

function armForge() {
  forgeAnswer = new Promise<void>((resolve) => {
    releaseForge = resolve;
  });
}

vi.mock("./user-identities", () => ({
  getGithubUserToken: async () => ({ token: "user-token", login: stored, avatarUrl: null }),
  updateIdentityAccount: async (
    _userId: string,
    _provider: string,
    account: { accountLogin: string | null },
  ) => {
    stored = account.accountLogin ?? "";
  },
}));

vi.mock("./github-user-auth", () => ({
  getGithubUserAccount: async () => {
    forgeCalls += 1;
    await forgeAnswer;
    return { id: 1234, login: "nouveau-nom", avatarUrl: null };
  },
}));

// Les deux autres branches ne sont pas le sujet : muettes, elles ne masquent ni
// ne retardent celle qu'on observe.
vi.mock("./connections", () => ({
  findReusableConnection: async () => null,
  listUserInstallations: async () => [],
  updateConnectionAccount: async () => {},
}));
vi.mock("./github-app", () => ({ getInstallationAccount: async () => null }));
vi.mock("./gitlab-app", () => ({
  getGitlabAccessToken: async () => "gitlab-token",
  getGitlabUser: async () => ({ id: 1, username: "x" }),
}));

beforeEach(() => {
  // Le garde est un `Map` de module : sans ça, le second test hériterait de la
  // fenêtre ouverte par le premier.
  vi.resetModules();
  stored = "ancien-nom";
  forgeCalls = 0;
  armForge();
});

it("fait attendre la requête concurrente au lieu de la laisser lire l'ancien nom", async () => {
  const { refreshForgeAccountNames } = await import("./account-refresh");

  const first = refreshForgeAccountNames("user-1");
  // Ce que la SECONDE requête verrait en base au moment où on lui rend la main.
  let seenBySecond: string | null = null;
  const second = refreshForgeAccountNames("user-1").then(() => {
    seenBySecond = stored;
  });

  releaseForge();
  await Promise.all([first, second]);

  expect(forgeCalls).toBe(1);
  expect(seenBySecond).toBe("nouveau-nom");
});

it("ne redemande rien à la forge dans la fenêtre du garde", async () => {
  const { refreshForgeAccountNames } = await import("./account-refresh");

  releaseForge();
  await refreshForgeAccountNames("user-1");
  await refreshForgeAccountNames("user-1");

  expect(forgeCalls).toBe(1);
});

it("garde une fenêtre par utilisateur", async () => {
  const { refreshForgeAccountNames } = await import("./account-refresh");

  releaseForge();
  await refreshForgeAccountNames("user-1");
  await refreshForgeAccountNames("user-2");

  expect(forgeCalls).toBe(2);
});
