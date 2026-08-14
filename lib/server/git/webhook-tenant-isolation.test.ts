import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteIssue } from "@/lib/server/git/issue-sync-core";

/**
 * Le cloisonnement des récepteurs de webhook de forge (MIN-333).
 *
 * Deux défauts, un seul fichier : ils tombaient tous les deux du même endroit —
 * le récepteur croyait ce que la charge utile disait d'elle-même.
 *
 *  1. **Le secret GitLab était global.** Le même jeton était écrit dans le hook
 *     de chaque locataire, et GitLab MONTRE le jeton d'un hook à qui peut
 *     l'éditer : tout mainteneur d'un dépôt lié pouvait le lire chez lui, puis
 *     signer des événements pour les dépôts des autres. Le secret est désormais
 *     propre au dépôt — celui d'un locataire ne signe rien chez son voisin.
 *  2. **Le dépôt était résolu par son NOM.** Un nom se libère chez la forge dès
 *     qu'on renomme, et se réattribue à qui le demande : le repreneur d'un nom
 *     héritait des tickets de son ancien porteur. Le routage passe sur l'id
 *     numérique, qui, lui, ne se réattribue jamais.
 *
 * Les deux moitiés se testent ensemble parce qu'elles se tiennent : le secret
 * est cherché par id de dépôt, et le fan-out aussi.
 */

process.env.GIT_TOKEN_ENCRYPTION_SECRET = "test-secret-for-forge-envelopes";

interface Row extends Record<string, unknown> {}

let linkRows: Row[] = [];
let issueRows: Row[] = [];
/** Les tickets créés — la sonde du fan-out : qui a reçu l'issue distante ? */
let creates: Record<string, unknown>[] = [];

/**
 * Double de table PostgREST, réduit à ce que ce fichier exerce : `eq`, `is`,
 * `in`, plus un `update` qui écrit VRAIMENT dans les lignes (la rotation de
 * secret se lit ensuite, c'est tout l'intérêt).
 */
function table(rows: () => Row[]) {
  const filters: ((row: Row) => boolean)[] = [];
  const matching = () => rows().filter((row) => filters.every((f) => f(row)));
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = (column: string, value: unknown) => {
    filters.push((row) => row[column] === value);
    return query;
  };
  query.is = (column: string, value: unknown) => {
    filters.push((row) => (row[column] ?? null) === value);
    return query;
  };
  query.in = (column: string, values: unknown[]) => {
    filters.push((row) => values.includes(row[column]));
    return query;
  };
  // `update` est différé jusqu'à l'await : les filtres arrivent APRÈS lui
  // (`.update(patch).eq(...)`), comme chez PostgREST.
  let patch: Record<string, unknown> | null = null;
  query.update = (values: Record<string, unknown>) => {
    patch = values;
    return query;
  };
  query.insert = async () => ({ error: null });
  query.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null });
  query.then = (onFulfilled: (value: unknown) => unknown) => {
    const rows = matching();
    if (patch) for (const row of rows) Object.assign(row, patch);
    return Promise.resolve({ data: rows, error: null }).then(onFulfilled);
  };
  return query;
}

const TABLES: Record<string, () => Row[]> = {
  project_git_links: () => linkRows,
  issues: () => issueRows,
  issue_categories: () => [],
};

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(TABLES[name] ?? (() => [])),
  }),
}));

vi.mock("@/lib/server/create-issue", () => ({
  createIssueForProject: async (args: Record<string, unknown>) => {
    creates.push(args);
    return { ok: true, issue: { id: "issue-new" } };
  },
}));
vi.mock("@/lib/server/update-issue", () => ({
  updateIssueFields: async () => ({ ok: true }),
}));
vi.mock("@/lib/server/set-issue-categories", () => ({
  setIssueCategories: async () => ({ ok: true, categoryIds: [] }),
}));
vi.mock("@/lib/server/categories", () => ({
  categoryKey: (name: string) => name.trim().toLowerCase(),
  resolveCategoryIdsByName: async () => ({ idByKey: new Map(), created: 0 }),
}));
vi.mock("@/lib/server/git/forge-members", () => ({
  buildForgeAssigneeIndex: async () => new Map(),
  matchForgeAssignee: () => null,
}));
vi.mock("@/lib/server/import-issues", () => ({
  importIssuesIntoProject: async () => ({ ok: true, result: { created: 0 } }),
}));
vi.mock("@/lib/server/entitlements", () => ({ ensureIssueLimit: async () => {} }));
vi.mock("@/lib/server/plan-limit-error", () => ({ isPlanLimitError: () => false }));
vi.mock("@/lib/server/git/github-app", () => ({ listRepoOpenIssues: async () => [] }));
vi.mock("@/lib/server/git/gitlab-app", () => ({
  getGitlabAccessToken: async () => "gitlab-token",
  listGitlabOpenIssues: async () => [],
}));

const {
  ensureRepoWebhookSecret,
  loadWebhookSecrets,
  rotateRepoWebhookSecret,
  verifyWebhookToken,
  webhookSecretMatches,
} = await import("@/lib/server/git/webhook-secret");
const { listIssueSyncTargets, syncRemoteIssueEvent } = await import(
  "@/lib/server/git/issue-sync"
);

/** Une liaison, telle que `project_git_links` la porte. */
function link(overrides: Row = {}): Row {
  return {
    id: "link-1",
    project_id: "project-1",
    provider: "gitlab",
    connection_id: "conn-1",
    installation_id: null,
    external_repo_id: "1001",
    repo_full_name: "acme/app",
    repo_owner: "acme",
    repo_name: "app",
    created_by: "user-owner",
    issue_sync_enabled: true,
    webhook_secret_encrypted: null,
    ...overrides,
  };
}

function remote(overrides: Partial<RemoteIssue> = {}): RemoteIssue {
  return {
    provider: "gitlab",
    repoFullName: "acme/app",
    repoId: "1001",
    number: 7,
    title: "Une issue",
    body: null,
    url: null,
    action: "open",
    actorLogin: null,
    state: "open",
    labels: [],
    assigneeLogins: [],
    ...overrides,
  };
}

beforeEach(() => {
  linkRows = [];
  issueRows = [];
  creates = [];
  delete process.env.GITLAB_WEBHOOK_SECRET;
});

describe("secret de webhook par dépôt", () => {
  it("mint un secret propre au dépôt et le persiste chiffré", async () => {
    linkRows = [link()];
    const secret = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });

    expect(secret).toHaveLength(64);
    const stored = linkRows[0].webhook_secret_encrypted as string;
    // Chiffré, pas en clair : la colonne ne doit jamais porter le jeton lisible.
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(secret);
    // Relire ne régénère pas : le hook posé chez GitLab porte CETTE valeur.
    await expect(
      ensureRepoWebhookSecret({ provider: "gitlab", externalRepoId: "1001" }),
    ).resolves.toBe(secret);
  });

  it("deux dépôts, deux secrets — et celui de l'un ne signe rien chez l'autre", async () => {
    linkRows = [
      link({ id: "link-a", project_id: "project-a", external_repo_id: "1001" }),
      link({ id: "link-b", project_id: "project-b", external_repo_id: "2002" }),
    ];
    const a = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    const b = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "2002",
    });
    expect(a).not.toBe(b);

    // LE défaut de MIN-333, dans sa forme la plus courte : le mainteneur du
    // dépôt A lit son propre jeton dans les réglages de son hook, et s'en sert
    // pour signer un événement destiné au dépôt B.
    const candidatesB = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "2002",
    });
    expect(verifyWebhookToken(a, candidatesB)).toBe("rejected");
    expect(verifyWebhookToken(b, candidatesB)).toBe("own");
  });

  it("deux projets sur le MÊME dépôt partagent le secret — ils partagent le hook", async () => {
    linkRows = [
      link({ id: "link-a", project_id: "project-a" }),
      link({ id: "link-b", project_id: "project-b" }),
    ];
    const first = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    // En générer un second invaliderait le hook du voisin : chez GitLab, le hook
    // vit sur le dépôt, il n'y en a qu'un.
    expect(linkRows.map((r) => r.webhook_secret_encrypted)).toEqual([
      linkRows[0].webhook_secret_encrypted,
      linkRows[0].webhook_secret_encrypted,
    ]);
    const candidates = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    expect(candidates.own).toEqual([first]);
  });

  it("le repli global est reconnu comme tel, pour être roté", async () => {
    process.env.GITLAB_WEBHOOK_SECRET = "legacy-global-secret";
    linkRows = [link()];
    const candidates = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    // Un hook posé avant MIN-333 porte encore l'ancien jeton : le refuser
    // couperait la synchro le temps d'une rotation.
    expect(verifyWebhookToken("legacy-global-secret", candidates)).toBe("legacy");
    expect(candidates.connectionId).toBe("conn-1");
    expect(verifyWebhookToken("n'importe quoi", candidates)).toBe("rejected");
  });

  it("sans repli déployé, un dépôt sans secret n'accepte plus rien", async () => {
    linkRows = [link()];
    const candidates = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    expect(candidates.own).toEqual([]);
    expect(candidates.legacy).toBeNull();
    expect(verifyWebhookToken("", candidates)).toBe("rejected");
    expect(verifyWebhookToken(null, candidates)).toBe("rejected");
  });

  it("la rotation remplace le secret de TOUTES les liaisons du dépôt", async () => {
    linkRows = [
      link({ id: "link-a", project_id: "project-a" }),
      link({ id: "link-b", project_id: "project-b" }),
    ];
    const before = await ensureRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    const after = await rotateRepoWebhookSecret({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    expect(after).not.toBe(before);
    const candidates = await loadWebhookSecrets({
      provider: "gitlab",
      externalRepoId: "1001",
    });
    expect(candidates.own).toEqual([after]);
  });

  it("compare à temps constant, et refuse un préfixe", () => {
    expect(webhookSecretMatches("abc", "abc")).toBe(true);
    expect(webhookSecretMatches("ab", "abc")).toBe(false);
    expect(webhookSecretMatches("abcd", "abc")).toBe(false);
    expect(webhookSecretMatches(null, "abc")).toBe(false);
  });
});

describe("routage du dépôt par son identifiant", () => {
  it("route sur l'id, même quand le dépôt a été renommé chez la forge", async () => {
    linkRows = [link({ repo_full_name: "acme/ancien-nom" })];

    const targets = await listIssueSyncTargets({
      provider: "gitlab",
      repoId: "1001",
    });
    expect(targets.map((t) => t.projectId)).toEqual(["project-1"]);

    await syncRemoteIssueEvent(remote({ repoFullName: "acme/nouveau-nom" }));
    expect(creates).toHaveLength(1);
    expect(creates[0].projectId).toBe("project-1");
  });

  it("NE route PAS un dépôt qui a repris le nom d'un autre", async () => {
    // Le cœur du défaut : `acme/app` a été libéré par son porteur, et quelqu'un
    // d'autre l'a repris. Son dépôt à lui porte un autre id — donc rien.
    linkRows = [link({ external_repo_id: "1001", repo_full_name: "acme/app" })];

    await syncRemoteIssueEvent(remote({ repoId: "9999", repoFullName: "acme/app" }));
    expect(creates).toEqual([]);
  });

  it("le nom stocké suit le renommage — il ne sert plus qu'à s'afficher", async () => {
    linkRows = [link({ repo_full_name: "acme/ancien", repo_owner: "acme" })];
    await syncRemoteIssueEvent(remote({ repoFullName: "nouvelle-org/app" }));
    expect(linkRows[0].repo_full_name).toBe("nouvelle-org/app");
    expect(linkRows[0].repo_owner).toBe("nouvelle-org");
    // `repo_name` est un nom d'AFFICHAGE côté GitLab, que la charge utile d'une
    // issue ne porte pas : on ne réécrit pas ce qu'on ne sait pas dire juste.
    expect(linkRows[0].repo_name).toBe("app");
  });

  it("ne sert que les liaisons dont la synchro est ACTIVE", async () => {
    linkRows = [link({ issue_sync_enabled: false })];
    await syncRemoteIssueEvent(remote());
    expect(creates).toEqual([]);
  });
});
