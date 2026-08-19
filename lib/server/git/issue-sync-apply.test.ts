import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteIssue } from "@/lib/server/git/issue-sync-core";

/**
 * `applyRemoteIssue` — what really happens when a remote issue arrives,
 * by webhook or by backfill.
 *
 * The PURE part of the sync (reading labels, translating states, forming
 * neutral payloads) has its own tests. This file holds the part which
 * WRITTEN, and it only exists for ONE rule, the one which governs the entire block of
 * reconciliation:
 *
 * **the forge only overwrites a field if it has something to say about it.**
 *
 * It always has a title, a body and a state: these three follow without
 * condition. It does not necessarily have a priority, size, assignment or
 * labels — and taking its SILENCE for a value would be devastating. On a repository
 * that never assigns its issues, the slightest webhook `labeled` would unassign
 * the ticket that someone has just taken in minddy, without anything having asked for it, and without a line in the logs to say so.
 *
 * So the assertions are as much about what the patch DOES NOT contain as they are about
 * what it does contain — that's where the regression would be hiding.
 */

interface Row extends Record<string, unknown> {}

let issueRows: Row[] = [];
let issueCategoryRows: Row[] = [];

/** What the write cores received — the probes for this entire file. */
let creates: Record<string, unknown>[] = [];
let updates: Record<string, unknown>[] = [];
let categorySets: Record<string, unknown>[] = [];
let metadataWrites: Record<string, unknown>[] = [];
let githubMetadataRows: Row[] = [];
let commentRows: Row[] = [];
let githubCommentSyncRows: Row[] = [];
/** How many times the assignee index was built (two queries each). */
let indexBuilds = 0;
/** Does `createIssueForProject` fail, and on which key? */
let createError: string | null = null;

function table(rows: () => Row[], tableName: string) {
  const filters: ((row: Row) => boolean)[] = [];
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
  // The end of backfill timestamp on `project_git_links` — written, never read.
  query.update = () => ({ eq: async () => ({ error: null }) });
  query.upsert = async (values: Record<string, unknown>) => {
    if (tableName === "github_issue_sync_metadata") metadataWrites.push(values);
    if (tableName === "github_issue_comment_syncs") {
      const key = `${values.remote_comment_id}:${values.issue_id}`;
      const existing = rows().find(
        (row) => `${row.remote_comment_id}:${row.issue_id}` === key,
      );
      if (existing) Object.assign(existing, values);
      else rows().push({ ...values });
    }
    return { error: null };
  };
  query.insert = (values: Record<string, unknown>) => ({
    select: () => ({
      single: async () => {
        const row = { ...values, id: `inserted-${rows().length + 1}` };
        rows().push(row);
        return { data: row, error: null };
      },
    }),
  });
  const matching = () => rows().filter((row) => filters.every((f) => f(row)));
  query.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null });
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: matching(), error: null }).then(onFulfilled);
  return query;
}

const TABLES: Record<string, () => Row[]> = {
  issues: () => issueRows,
  issue_categories: () => issueCategoryRows,
  github_issue_sync_metadata: () => githubMetadataRows,
  comments: () => commentRows,
  github_issue_comment_syncs: () => githubCommentSyncRows,
};

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(TABLES[name] ?? (() => []), name),
  }),
}));

vi.mock("@/lib/server/create-issue", () => ({
  createIssueForProject: async (args: Record<string, unknown>) => {
    creates.push(args);
    return createError
      ? { ok: false, errorKey: createError }
      : { ok: true, issue: { id: "issue-new" } };
  },
}));

vi.mock("@/lib/server/update-issue", () => ({
  updateIssueFields: async (args: Record<string, unknown>) => {
    updates.push(args);
    return { ok: true };
  },
}));

vi.mock("@/lib/server/set-issue-categories", () => ({
  setIssueCategories: async (args: Record<string, unknown>) => {
    categorySets.push(args);
    return { ok: true, categoryIds: args.categoryIds };
  },
}));

// Project labels: a stable id by name, so that the test speaks of
// names and no uuid. The real function has its own tests (categories.test.ts)
// — but it is reproduced here ON ITS SENSITIVE POINT: the index finger is built with
// `categoryKey`, so it goes through truncation. A double that would index on
// the whole name would make this file blind to what the real code does.
const categoryKey = (name: string) => name.trim().slice(0, 200).toLowerCase();

vi.mock("@/lib/server/categories", () => ({
  categoryKey,
  resolveCategoryIdsByName: async (_projectId: string, names: string[]) => ({
    idByKey: new Map(names.map((n) => [categoryKey(n), `cat-${categoryKey(n)}`])),
    created: 0,
  }),
}));

vi.mock("@/lib/server/git/forge-members", () => ({
  buildForgeAssigneeIndex: async () => {
    indexBuilds += 1;
    return new Map([["octocat", "user-dev"]]);
  },
  matchForgeAssignee: (logins: string[], index: Map<string, string>) => {
    for (const login of logins) {
      const found = index.get(login.trim().toLowerCase());
      if (found) return found;
    }
    return null;
  },
}));

/** Batches passed to bulk import — the backfill probe. */
let imports: Record<string, unknown>[] = [];
/** The open exits that the forge returns to the backfill. */
let openIssues: Record<string, unknown>[] = [];
/** Has the project reached its ticket cap? */
let overIssueLimit = false;

class PlanLimitError extends Error {}

vi.mock("@/lib/server/import-issues", () => ({
  importIssuesIntoProject: async (args: Record<string, unknown>) => {
    imports.push(args);
    return { ok: true, result: { created: (args.issues as unknown[]).length } };
  },
}));

vi.mock("@/lib/server/entitlements", () => ({
  ensureIssueLimit: async () => {
    if (overIssueLimit) throw new PlanLimitError("issue limit reached");
  },
}));
vi.mock("@/lib/server/plan-limit-error", () => ({
  isPlanLimitError: (e: unknown) => e instanceof PlanLimitError,
}));

const githubComments: Record<string, Record<string, unknown>[]> = {};
vi.mock("@/lib/server/git/github-app", () => ({
  listRepoOpenIssues: async () => openIssues,
  listGithubIssueComments: async (_installationId: number, _repo: string, issueNumber: number) =>
    githubComments[String(issueNumber)] ?? [],
}));
vi.mock("@/lib/server/git/gitlab-app", () => ({
  getGitlabAccessToken: async () => "gitlab-token",
  listGitlabOpenIssues: async () => openIssues,
}));

const { applyRemoteIssue, backfillRemoteIssues } = await import(
  "@/lib/server/git/issue-sync"
);

const TARGET = {
  linkId: "link-1",
  projectId: "project-1",
  provider: "github" as const,
  connectionId: "conn-1",
  installationId: 42,
  externalRepoId: "9001",
  repoFullName: "acme/app",
  createdBy: "user-owner",
};

/** A remote outcome event, in its neutral form. */
function remote(overrides: Partial<RemoteIssue> = {}): RemoteIssue {
  return {
    provider: "github",
    repoFullName: "acme/app",
    repoId: "9001",
    number: 7,
    title: "Le bouton ne répond pas",
    body: "Sur Safari uniquement.",
    url: "https://github.com/acme/app/issues/7",
    action: "opened",
    actorLogin: "octocat",
    state: "open",
    labels: [],
    assigneeLogins: [],
    ...overrides,
  };
}

/** A ticket ALREADY imported for this issue, as the base carries it. */
function imported(overrides: Row = {}): Row {
  const row: Row = {
    id: "issue-1",
    deleted_at: null,
    project_id: TARGET.projectId,
    remote_provider: "github",
    remote_repo_id: "9001",
    remote_number: 7,
    status: "todo",
    title: "Le bouton ne répond pas",
    description: "Sur Safari uniquement.",
    assignee_id: null,
    priority: "none",
    effort: null,
    ...overrides,
  };
  issueRows.push(row);
  return row;
}

/** The patch passed to `updateIssueFields`, or null if nothing was written. */
const patch = () => (updates[0]?.input as Record<string, unknown>) ?? null;

beforeEach(() => {
  issueRows = [];
  issueCategoryRows = [];
  creates = [];
  updates = [];
  categorySets = [];
  metadataWrites = [];
  githubMetadataRows = [];
  commentRows = [];
  githubCommentSyncRows = [];
  imports = [];
  openIssues = [];
  for (const key of Object.keys(githubComments)) delete githubComments[key];
  indexBuilds = 0;
  createError = null;
  overIssueLimit = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("applyRemoteIssue — l'issue n'a jamais été importée", () => {
  it("fait atterrir le ticket en triage, avec le lien de l'issue en RESSOURCE", async () => {
    await applyRemoteIssue(TARGET, remote());

    const input = creates[0].input as Record<string, unknown>;
    expect(input.status).toBe("triage");
    expect(input.title).toBe("Le bouton ne répond pas");
    expect(input.description).toBe("Sur Safari uniquement.");
    // The link that we open from the panel, next to the files.
    expect(input.resources).toEqual([
      {
        kind: "link",
        url: "https://github.com/acme/app/issues/7",
        file_name: "acme/app#7",
        icon_data_url: expect.stringContaining("data:image/webp;base64,"),
      },
    ]);
    // The distant identity travels with the line: it is this which duplicates.
    expect(creates[0].remote).toEqual({
      provider: "github",
      repoId: "9001",
      number: 7,
      url: "https://github.com/acme/app/issues/7",
    });
  });

  it("atterrit en triage MÊME fermée — personne ne l'a encore vue", async () => {
    // Real case: an exit beyond the backfill ceiling, closed before
    // know her. Creating it in `done` would make it enter the project without
    // that it ever existed for the team.
    await applyRemoteIssue(TARGET, remote({ action: "closed", state: "closed" }));

    expect((creates[0].input as Record<string, unknown>).status).toBe("triage");
  });

  it("répartit les labels : priorité, effort, et le reste en catégories", async () => {
    await applyRemoteIssue(
      TARGET,
      remote({ labels: ["P1", "size/M", "bug", "frontend"] }),
    );

    const input = creates[0].input as Record<string, unknown>;
    expect(input.priority).toBe("high");
    expect(input.effort).toBe("m");
    // “P1” and “size/M” have been consumed: a “P1” column next to a
    // column “P2” does not learn anything that a sort by priority does not say better.
    expect(categorySets[0].categoryIds).toEqual(["cat-bug", "cat-frontend"]);
  });

  it("rend le compte de forge à son membre minddy", async () => {
    await applyRemoteIssue(TARGET, remote({ assigneeLogins: ["octocat"] }));

    expect((creates[0].input as Record<string, unknown>).assignee_id).toBe("user-dev");
  });

  it("laisse non assigné un login qui n'est raccroché à personne", async () => {
    await applyRemoteIssue(TARGET, remote({ assigneeLogins: ["inconnu"] }));

    expect((creates[0].input as Record<string, unknown>).assignee_id).toBeNull();
  });

  it("se tait sur une redélivrance de webhook — c'est le chemin normal", async () => {
    createError = "remoteIssueAlreadyImported";
    await applyRemoteIssue(TARGET, remote());

    expect(console.error).not.toHaveBeenCalled();
    expect(categorySets).toHaveLength(0);
  });

  it("journalise un échec qui n'est PAS une redélivrance", async () => {
    createError = "issueLimitReached";
    await applyRemoteIssue(TARGET, remote());

    expect(console.error).toHaveBeenCalled();
  });

  it("ne fait rien du tout si la liaison n'a pas d'acteur", async () => {
    await applyRemoteIssue({ ...TARGET, createdBy: null }, remote());

    expect(creates).toHaveLength(0);
  });
});

describe("applyRemoteIssue — le ticket existe : le silence n'écrase rien", () => {
  it("aligne le titre et le corps, qui suivent sans condition", async () => {
    imported();
    await applyRemoteIssue(
      TARGET,
      remote({ title: "Le bouton reste gris", body: "Sur Safari ET Firefox." }),
    );

    expect(patch()).toEqual({
      title: "Le bouton reste gris",
      description: "Sur Safari ET Firefox.",
    });
  });

  it("n'écrit RIEN quand la forge ne dit rien de neuf", async () => {
    imported();
    await applyRemoteIssue(TARGET, remote({ action: "labeled" }));

    expect(updates).toHaveLength(0);
  });

  it("ne désassigne pas quand la forge ne nomme personne", async () => {
    // The trap: on a repository that never assigns the slightest webhook
    // `labeled` would empty the box that someone just filled in minddy.
    imported({ assignee_id: "user-dev" });
    await applyRemoteIssue(TARGET, remote({ action: "labeled", assigneeLogins: [] }));

    expect(updates).toHaveLength(0);
  });

  it("ne vide pas la case pour un assigné distant qu'on ne reconnaît pas", async () => {
    imported({ assignee_id: "user-dev" });
    await applyRemoteIssue(TARGET, remote({ assigneeLogins: ["inconnu"] }));

    expect(updates).toHaveLength(0);
  });

  it("ne remet pas la priorité à `none` quand le label a disparu", async () => {
    imported({ priority: "urgent" });
    await applyRemoteIssue(TARGET, remote({ action: "unlabeled", labels: ["bug"] }));

    expect(patch()).toBeNull();
  });

  it("suit la priorité et l'effort quand la forge les porte", async () => {
    imported({ priority: "low", effort: "xs" });
    await applyRemoteIssue(TARGET, remote({ labels: ["priority: urgent", "size: XL"] }));

    expect(patch()).toEqual({ priority: "urgent", effort: "xl" });
  });

  it("maps a GitHub milestone deadline and preserves provider-only metadata", async () => {
    imported({ due_date: null, updated_at: "2026-08-19T12:00:00Z" });
    await applyRemoteIssue(
      TARGET,
      remote({
        dueDate: "2026-08-30T00:00:00Z",
        updatedAt: "2026-08-19T13:00:00Z",
        githubMetadata: {
          nodeId: "I_kwDOA",
          authorLogin: "octocat",
          authorAssociation: "MEMBER",
          stateReason: null,
          locked: false,
          activeLockReason: null,
          milestone: { title: "Release 1.0" },
          createdAt: "2026-08-19T11:00:00Z",
          closedAt: null,
          closedByLogin: null,
          issueType: { name: "Bug" },
        },
      }),
    );

    expect(patch()).toEqual({ due_date: "2026-08-30T00:00:00Z" });
    expect(metadataWrites).toHaveLength(1);
    expect(metadataWrites[0]).toMatchObject({
      issue_id: "issue-1",
      author_login: "octocat",
      milestone: { title: "Release 1.0" },
      metadata: { issue_type: { name: "Bug" } },
    });
  });

  it("does not overwrite a later minddy edit with an older GitHub delivery", async () => {
    imported({ title: "Edited in minddy", updated_at: "2026-08-19T14:00:00Z" });
    await applyRemoteIssue(
      TARGET,
      remote({ title: "Stale GitHub title", updatedAt: "2026-08-19T13:00:00Z" }),
    );

    expect(updates).toHaveLength(0);
  });

  it("accepts a newer GitHub delivery after a prior GitHub synchronization", async () => {
    imported({ title: "Earlier GitHub title", updated_at: "2026-08-19T14:00:00Z" });
    githubMetadataRows.push({
      issue_id: "issue-1",
      updated_at_remote: "2026-08-19T13:00:00Z",
      synced_at: "2026-08-19T14:01:00Z",
    });

    await applyRemoteIssue(
      TARGET,
      remote({ title: "Newer GitHub title", updatedAt: "2026-08-19T13:30:00Z" }),
    );

    expect(patch()).toEqual({ title: "Newer GitHub title" });
  });

  it("estampille l'écriture `forgeSync` — c'est L'ANTI-BOUCLE", async () => {
    // Without this flag, `updateIssueFields` would push the status back to the forge
    // qui vient d'en descendre, qui reviendrait par webhook, sans fin.
    imported({ status: "todo" });
    await applyRemoteIssue(TARGET, remote({ action: "closed", state: "closed" }));

    expect(patch()).toEqual({ status: "done" });
    expect(updates[0].forgeSync).toBe("github");
    expect(updates[0].actorId).toBe("user-owner");
  });

  it("ne requalifie pas un ticket délibérément ANNULÉ que la forge a fermé", async () => {
    imported({ status: "canceled" });
    await applyRemoteIssue(TARGET, remote({ action: "edited", state: "closed" }));

    expect(updates).toHaveLength(0);
  });

  it("rouvre en backlog, jamais en triage — le ticket a déjà été vu", async () => {
    imported({ status: "done" });
    await applyRemoteIssue(TARGET, remote({ action: "reopened", state: "open" }));

    expect(patch()).toEqual({ status: "backlog" });
  });

  it("ne construit l'index d'assignés que si l'issue nomme quelqu'un", async () => {
    imported();
    await applyRemoteIssue(TARGET, remote({ action: "labeled" }));
    expect(indexBuilds).toBe(0);

    await applyRemoteIssue(TARGET, remote({ assigneeLogins: ["octocat"] }));
    expect(indexBuilds).toBe(1);
  });

  it("ignore un ticket d'un autre projet portant le même numéro distant", async () => {
    imported({ id: "issue-ailleurs", project_id: "project-2" });
    await applyRemoteIssue(TARGET, remote());

    // Seen as never imported here: it is a CREATION, not a reconciliation.
    expect(creates).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it("ignore un ticket supprimé — il ne revient pas par la bande", async () => {
    imported({ deleted_at: "2026-08-01T00:00:00Z" });
    await applyRemoteIssue(TARGET, remote());

    expect(creates).toHaveLength(1);
  });
});

describe("applyRemoteIssue — les catégories", () => {
  it("remplace le jeu complet : un label retiré chez la forge retire la catégorie", async () => {
    imported();
    issueCategoryRows.push(
      { issue_id: "issue-1", category_id: "cat-bug" },
      { issue_id: "issue-1", category_id: "cat-frontend" },
    );
    await applyRemoteIssue(TARGET, remote({ labels: ["bug"] }));

    expect(categorySets[0].categoryIds).toEqual(["cat-bug"]);
    expect(categorySets[0].forgeSync).toBe("github");
  });

  it("ne réécrit RIEN quand le jeu est déjà le bon", async () => {
    // `setIssueCategories` does a DELETE then an INSERT: replay it each time
    // webhook would flash categories on all open boards,
    // in real time, without anything happening.
    imported();
    issueCategoryRows.push({ issue_id: "issue-1", category_id: "cat-bug" });
    await applyRemoteIssue(TARGET, remote({ labels: ["bug"] }));

    expect(categorySets).toHaveLength(0);
  });

  it("ne balaye pas les catégories quand la forge n'a AUCUN label", async () => {
    // The price, assumed, of not confusing “nothing to say” and “nothing”: a
    // repository which does not label its outputs must not empty, at each webhook,
    // what was stored by hand in minddy.
    imported();
    issueCategoryRows.push({ issue_id: "issue-1", category_id: "cat-maison" });
    await applyRemoteIssue(TARGET, remote({ labels: [] }));

    expect(categorySets).toHaveLength(0);
  });

  it("ne garde qu'un exemplaire d'une catégorie que deux labels désignent", async () => {
    // Two labels that `readForgeLabels` keeps SEPARATE (their tokens differ)
    // but that the limit of 200 characters brings back to the same category. An id
    // repeated would miss the comparison “nothing has moved” just above, and
    // the DELETE/INSERT would start again with each webhook — the flashing that it
    // is there to avoid.
    const long = "z".repeat(240);
    imported();
    issueCategoryRows.push({ issue_id: "issue-1", category_id: `cat-${"z".repeat(200)}` });

    await applyRemoteIssue(TARGET, remote({ labels: [`${long}-a`, `${long}-b`] }));

    expect(categorySets).toHaveLength(0);
  });
});

describe("backfillRemoteIssues — l'import à l'activation du toggle", () => {
  /** An open issue such as `listRepoOpenIssues` renders it. */
  const openIssue = (overrides: Record<string, unknown> = {}) => ({
    number: 7,
    title: "Le bouton ne répond pas",
    body: "Sur Safari uniquement.",
    htmlUrl: "https://github.com/acme/app/issues/7",
    labels: [],
    assigneeLogins: [],
    updatedAt: null,
    githubMetadata: {
      nodeId: null,
      authorLogin: null,
      authorAssociation: null,
      stateReason: null,
      locked: false,
      activeLockReason: null,
      milestone: null,
      createdAt: null,
      closedAt: null,
      closedByLogin: null,
      issueType: null,
    },
    ...overrides,
  });

  /** Tickets from an import batch. */
  const batch = () => (imports[0]?.issues as Record<string, unknown>[]) ?? [];

  it("importe chaque issue en triage, avec son lien en ressource", async () => {
    openIssues = [openIssue()];

    expect(await backfillRemoteIssues(TARGET)).toBe(1);
    expect(batch()[0]).toMatchObject({
      title: "Le bouton ne répond pas",
      description: "Sur Safari uniquement.",
      status: "triage",
      resources: [
        {
          kind: "link",
          url: "https://github.com/acme/app/issues/7",
          file_name: "acme/app#7",
        },
      ],
      remote: {
        provider: "github",
        repoId: "9001",
        number: 7,
        url: "https://github.com/acme/app/issues/7",
      },
    });
    expect(imports[0].source).toBe("github");
  });

  it("SAUTE ce que le projet a déjà — réarmer le toggle ne double rien", async () => {
    imported({ remote_number: 7 });
    openIssues = [openIssue(), openIssue({ number: 8 })];

    expect(await backfillRemoteIssues(TARGET)).toBe(1);
    expect(batch().map((i) => (i.remote as { number: number }).number)).toEqual([8]);
  });

  it("imports existing GitHub comments when the repository link is enabled", async () => {
    imported({ remote_number: 7 });
    openIssues = [openIssue()];
    githubComments["7"] = [
      {
        id: "comment-7",
        body: "Historical context",
        authorLogin: "octocat",
        authorAssociation: "MEMBER",
        htmlUrl: "https://github.com/acme/app/issues/7#issuecomment-7",
        createdAt: "2026-08-19T10:00:00Z",
        updatedAt: "2026-08-19T10:00:00Z",
      },
    ];

    await backfillRemoteIssues(TARGET);

    expect(commentRows).toMatchObject([
      {
        issue_id: "issue-1",
        body: "Historical context",
        created_at: "2026-08-19T10:00:00Z",
      },
    ]);
    expect(githubCommentSyncRows).toMatchObject([
      {
        remote_comment_id: "comment-7",
        issue_id: "issue-1",
        author_login: "octocat",
      },
    ]);
  });

  it("preserves GitHub-only issue metadata for issues already present at backfill", async () => {
    imported({ remote_number: 7 });
    openIssues = [
      openIssue({
        updatedAt: "2026-08-19T10:00:00Z",
        githubMetadata: {
          nodeId: "I_kwDOA",
          authorLogin: "octocat",
          authorAssociation: "MEMBER",
          stateReason: null,
          locked: false,
          activeLockReason: null,
          milestone: { title: "Release 1.0" },
          createdAt: "2026-08-19T09:00:00Z",
          closedAt: null,
          closedByLogin: null,
          issueType: { name: "Bug" },
        },
      }),
    ];

    await backfillRemoteIssues(TARGET);

    expect(metadataWrites).toContainEqual(
      expect.objectContaining({
        issue_id: "issue-1",
        github_node_id: "I_kwDOA",
        metadata: { issue_type: { name: "Bug" } },
      }),
    );
  });

  it("n'importe RIEN et n'appelle pas l'import quand tout est déjà là", async () => {
    imported({ remote_number: 7 });
    openIssues = [openIssue()];

    expect(await backfillRemoteIssues(TARGET)).toBe(0);
    expect(imports).toHaveLength(0);
  });

  it("répartit les labels et raccroche l'assigné, comme le webhook", async () => {
    openIssues = [
      openIssue({ labels: ["P1", "size/M", "bug"], assigneeLogins: ["octocat"] }),
    ];
    await backfillRemoteIssues(TARGET);

    expect(batch()[0]).toMatchObject({
      priority: "high",
      effort: "m",
      labels: ["bug"],
      assigneeId: "user-dev",
    });
  });

  it("construit UN SEUL index d'assignés pour tout le lot", async () => {
    // Two requests per batch, not two per ticket: out of 500 issues, this is the
    // difference between two requests and a thousand.
    openIssues = [openIssue(), openIssue({ number: 8 }), openIssue({ number: 9 })];
    await backfillRemoteIssues(TARGET);

    expect(indexBuilds).toBe(1);
  });

  it("renonce sans lever quand le projet a atteint son plafond de tickets", async () => {
    overIssueLimit = true;
    openIssues = [openIssue()];

    expect(await backfillRemoteIssues(TARGET)).toBe(0);
    expect(imports).toHaveLength(0);
  });

  it("ne fait rien si la liaison n'a pas d'acteur", async () => {
    openIssues = [openIssue()];

    expect(await backfillRemoteIssues({ ...TARGET, createdBy: null })).toBe(0);
    expect(imports).toHaveLength(0);
  });

  it("lit le vocabulaire de GitLab — `iid`, `description`, `webUrl`", async () => {
    openIssues = [
      {
        iid: 12,
        title: "Migration lente",
        description: "Sur les gros projets.",
        webUrl: "https://gitlab.com/acme/app/-/issues/12",
        labels: ["bug"],
        assigneeLogins: [],
      },
    ];

    const gitlabTarget = {
      ...TARGET,
      provider: "gitlab" as const,
      installationId: null,
      repoFullName: "acme/app",
    };
    expect(await backfillRemoteIssues(gitlabTarget)).toBe(1);
    expect(batch()[0]).toMatchObject({
      title: "Migration lente",
      description: "Sur les gros projets.",
      remote: { provider: "gitlab", number: 12 },
      resources: [{ file_name: "acme/app#12" }],
    });
  });
});
