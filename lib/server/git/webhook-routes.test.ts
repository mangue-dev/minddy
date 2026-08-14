import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les deux récepteurs de webhook de forge, exercés à la porte (MIN-333).
 *
 * Le fichier voisin (`webhook-tenant-isolation.test.ts`) tient la mécanique du
 * secret et du routage ; celui-ci tient ce que la ROUTE en fait — le code de
 * réponse, et surtout ce qui est traité ou ne l'est pas. C'est la moitié qui
 * compte pour un attaquant : un 401 qui aurait déjà écrit ne protège rien.
 *
 * Trois promesses, les mêmes des deux côtés :
 *  · aucune matière à vérifier → **503**, rien traité (et la forge re-livrera) ;
 *  · jeton d'un autre locataire → **401**, rien traité ;
 *  · livraison déjà vue → acquittée sans être rejouée.
 */

process.env.GIT_TOKEN_ENCRYPTION_SECRET = "test-secret-for-forge-envelopes";

interface Row extends Record<string, unknown> {}

let linkRows: Row[] = [];
/** Les identifiants de livraison déjà enregistrés — l'anti-rejeu en base. */
let deliveries: string[] = [];

function linksTable() {
  const filters: ((row: Row) => boolean)[] = [];
  const query: Record<string, unknown> = {};
  const matching = () => linkRows.filter((row) => filters.every((f) => f(row)));
  let patch: Record<string, unknown> | null = null;
  query.select = () => query;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.is = () => query;
  query.in = () => query;
  query.update = (values: Record<string, unknown>) => {
    patch = values;
    return query;
  };
  query.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null });
  query.then = (onFulfilled: (value: unknown) => unknown) => {
    const rows = matching();
    if (patch) for (const row of rows) Object.assign(row, patch);
    return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
  };
  return query;
}

/** La table d'anti-rejeu : c'est la clé primaire qui fait la garde (23505). */
function deliveriesTable() {
  return {
    insert: async (row: { provider: string; delivery_id: string }) => {
      const key = `${row.provider}:${row.delivery_id}`;
      if (deliveries.includes(key)) {
        return { error: { code: "23505", message: "duplicate key" } };
      }
      deliveries.push(key);
      return { error: null };
    },
  };
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) =>
      name === "forge_webhook_deliveries" ? deliveriesTable() : linksTable(),
  }),
}));

/** Le travail réel du récepteur, réduit à une sonde : a-t-il été fait ? */
const syncRemoteIssueEvent = vi.fn(async () => {});
vi.mock("@/lib/server/git/issue-sync", () => ({
  syncRemoteIssueEvent: (...a: unknown[]) => syncRemoteIssueEvent(...(a as [])),
}));

const rotateGitlabWebhookSecret = vi.fn(async () => {});
vi.mock("@/lib/server/git/gitlab-app", () => ({
  rotateGitlabWebhookSecret: (...a: unknown[]) =>
    rotateGitlabWebhookSecret(...(a as [])),
}));

const verifyGithubSignature = vi.fn(() => true);
vi.mock("@/lib/server/git/github-app", () => ({
  verifyGithubSignature: (...a: unknown[]) => verifyGithubSignature(...(a as [])),
}));

vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (fn: () => Promise<unknown>) => {
    void fn();
  },
}));

vi.mock("@/lib/server/agent/runs", () => ({
  syncPrState: async () => [],
  findRunsForPr: async () => [],
}));
vi.mock("@/lib/server/agent/issue-status-sync", () => ({
  syncIssueStatusFromPr: async () => {},
}));
vi.mock("@/lib/server/agent/pr-activity", () => ({
  applyForgePrToIssue: async () => {},
  isPrActionEcho: async () => false,
  recordForgePrActionEvents: async () => {},
  recordForgePrGesture: async () => {},
  notifyForgePrAction: async () => {},
}));
vi.mock("@/lib/server/agent/pr-opened-notify", () => ({
  notifyPullRequestOpened: async () => {},
}));
vi.mock("@/lib/server/agent/pull-requests", () => ({
  findPullRequestByNumber: async () => null,
  findPullRequestsByHeadSha: async () => [],
  resolveIssueForPr: async () => null,
  upsertPullRequest: async () => null,
}));
vi.mock("@/lib/server/agent/pr-mention", () => ({
  handleForgeNumoMention: async () => {},
}));
vi.mock("@/lib/server/agent/pr-live", () => ({
  broadcastPrChanged: () => {},
  broadcastPrChangedByNumber: async () => {},
}));

const { ensureRepoWebhookSecret } = await import(
  "@/lib/server/git/webhook-secret"
);
const { POST: gitlabPOST } = await import("@/app/api/webhooks/gitlab/route");
const { POST: githubPOST } = await import("@/app/api/webhooks/github/route");

const GITLAB_ISSUE = {
  object_kind: "issue",
  project: { id: 1001, path_with_namespace: "acme/app" },
  object_attributes: { iid: 7, title: "Une issue", action: "open", state: "opened" },
};

const GITHUB_ISSUE = {
  action: "opened",
  issue: { number: 7, title: "Une issue", state: "open" },
  repository: { id: 9001, full_name: "acme/app" },
};

function gitlabRequest(
  token: string | null,
  opts: { deliveryId?: string; body?: unknown } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== null) headers.set("x-gitlab-token", token);
  headers.set("x-gitlab-event-uuid", opts.deliveryId ?? crypto.randomUUID());
  return new Request("https://minddy.app/api/webhooks/gitlab", {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? GITLAB_ISSUE),
  }) as unknown as Parameters<typeof gitlabPOST>[0];
}

function githubRequest(opts: { deliveryId?: string } = {}) {
  return new Request("https://minddy.app/api/webhooks/github", {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      "x-github-event": "issues",
      "x-hub-signature-256": "sha256=whatever",
      "x-github-delivery": opts.deliveryId ?? crypto.randomUUID(),
    }),
    body: JSON.stringify(GITHUB_ISSUE),
  }) as unknown as Parameters<typeof githubPOST>[0];
}

function link(overrides: Row = {}): Row {
  return {
    id: "link-1",
    project_id: "project-1",
    provider: "gitlab",
    connection_id: "conn-1",
    external_repo_id: "1001",
    repo_full_name: "acme/app",
    issue_sync_enabled: true,
    webhook_secret_encrypted: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyGithubSignature.mockReturnValue(true);
  linkRows = [link()];
  deliveries = [];
  process.env.GIT_TOKEN_ENCRYPTION_SECRET = "test-secret-for-forge-envelopes";
  delete process.env.GITLAB_WEBHOOK_SECRET;
  process.env.GITHUB_WEBHOOK_SECRET = "github-app-secret";
});

describe("POST /api/webhooks/gitlab", () => {
  it("aucune matière à vérifier → 503, rien traité", async () => {
    delete process.env.GIT_TOKEN_ENCRYPTION_SECRET;
    const response = await gitlabPOST(gitlabRequest("n'importe quoi"));
    expect(response.status).toBe(503);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("le jeton d'un AUTRE dépôt → 401, rien traité", async () => {
    linkRows = [
      link({ id: "link-a", project_id: "project-a", external_repo_id: "1001" }),
      link({ id: "link-b", project_id: "project-b", external_repo_id: "2002" }),
    ];
    await ensureRepoWebhookSecret({ provider: "gitlab", externalRepoId: "1001" });
    const other = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "2002",
    });

    // Le mainteneur du dépôt 2002 lit son jeton chez lui et signe pour 1001.
    const response = await gitlabPOST(gitlabRequest(other));
    expect(response.status).toBe(401);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("le jeton du dépôt → 200, et l'issue est synchronisée", async () => {
    const secret = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    const response = await gitlabPOST(gitlabRequest(secret));
    expect(response.status).toBe(200);
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
    expect(rotateGitlabWebhookSecret).not.toHaveBeenCalled();
  });

  it("un jeton absent → 401", async () => {
    await ensureRepoWebhookSecret({ provider: "gitlab", externalRepoId: "1001" });
    const response = await gitlabPOST(gitlabRequest(null));
    expect(response.status).toBe(401);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("un hook resté sur le secret global : traité, PUIS roté", async () => {
    process.env.GITLAB_WEBHOOK_SECRET = "legacy-global-secret";
    const response = await gitlabPOST(gitlabRequest("legacy-global-secret"));
    expect(response.status).toBe(200);
    // Le traitement passe : refuser couperait la synchro des dépôts liés avant
    // cette version, le temps d'une rotation qu'ils n'ont pas encore eue.
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
    expect(rotateGitlabWebhookSecret).toHaveBeenCalledWith({
      externalRepoId: "1001",
      connectionId: "conn-1",
    });
  });

  it("une livraison déjà vue n'est pas rejouée", async () => {
    const secret = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    const deliveryId = "livraison-1";
    await gitlabPOST(gitlabRequest(secret, { deliveryId }));
    const replay = await gitlabPOST(gitlabRequest(secret, { deliveryId }));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
  });

  it("une charge sans dépôt identifiable → 400", async () => {
    const response = await gitlabPOST(
      gitlabRequest("peu importe", { body: { object_kind: "issue" } }),
    );
    expect(response.status).toBe(400);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/github", () => {
  it("secret absent → 503, rien traité", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const response = await githubPOST(githubRequest());
    expect(response.status).toBe(503);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("signature invalide → 401, rien traité", async () => {
    verifyGithubSignature.mockReturnValue(false);
    const response = await githubPOST(githubRequest());
    expect(response.status).toBe(401);
    expect(syncRemoteIssueEvent).not.toHaveBeenCalled();
  });

  it("une livraison déjà vue n'est pas rejouée", async () => {
    const deliveryId = "livraison-gh-1";
    await githubPOST(githubRequest({ deliveryId }));
    const replay = await githubPOST(githubRequest({ deliveryId }));
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });
    expect(syncRemoteIssueEvent).toHaveBeenCalledTimes(1);
  });
});
