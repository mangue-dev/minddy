import { beforeEach, expect, it, vi } from "vitest";

/**
 * MIN-154, half 2: the burst guard from `refreshForgeAccountNames`.
 *
 * What he should be holding is two sentences. **Only one forge round trip**
 * per window — the settings page mounts its two requests together
 * (`useGitIdentitiesQuery` + `useGitConnectionsQuery`), and opening the tab does not have to replay three calls. But **both queries read after
 * writing**: a guard who simply dates the pass would let the second one return to base before the first one had written there, and the expired name
 * would appear on the very load that was supposed to correct it.
 *
 * The forge is on a leash here (`forgeAnswer`): this is the only way to
 * place the second request DURING the first, where the bug lived.
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

// The other two branches are not the subject: silent, they neither mask nor
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
  // The guard is a module `Map`: without it, the second test would inherit the
  // window opened by the first.
  vi.resetModules();
  stored = "ancien-nom";
  forgeCalls = 0;
  armForge();
});

it("makes the concurrent request wait instead of letting it read the old name", async () => {
  const { refreshForgeAccountNames } = await import("./account-refresh");

  const first = refreshForgeAccountNames("user-1");
  // What the SECOND request would see in the base when we give it back control.
  let seenBySecond: string | null = null;
  const second = refreshForgeAccountNames("user-1").then(() => {
    seenBySecond = stored;
  });

  releaseForge();
  await Promise.all([first, second]);

  expect(forgeCalls).toBe(1);
  expect(seenBySecond).toBe("nouveau-nom");
});

it("does not ask the forge again during the guard window", async () => {
  const { refreshForgeAccountNames } = await import("./account-refresh");

  releaseForge();
  await refreshForgeAccountNames("user-1");
  await refreshForgeAccountNames("user-1");

  expect(forgeCalls).toBe(1);
});

it("keeps a window per user", async () => {
  const { refreshForgeAccountNames } = await import("./account-refresh");

  releaseForge();
  await refreshForgeAccountNames("user-1");
  await refreshForgeAccountNames("user-2");

  expect(forgeCalls).toBe(2);
});
