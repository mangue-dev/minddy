import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteIssue } from "@/lib/server/git/issue-sync-core";

/**
 * `applyRemoteIssue` — what really happens when a forge issue arrives, by
 * webhook or by backfill.
 *
 * The PURE part of the sync (reading labels, mapping states, building neutral
 * payloads) has its own tests. This file holds the part that WRITES, and it
 * exists for ONE rule, the one that governs the whole reconciliation block:
 *
 * **the forge only overwrites a field when it has something to say about it.**
 *
 * It always has a title, a body and a state: those three follow
 * unconditionally. It does not necessarily have a priority, size, assignee or
 * labels, and taking its SILENCE for a value would be devastating. On a
 * repository that never assigns its issues, the slightest `labeled` webhook
 * would unassign the issue someone just picked up in minddy, without anyone
 * asking for it and without a log line to say so.
 *
 * So the assertions cover what the patch does NOT contain as much as what it
 * contains: that is where a regression would hide.
 */

interface Row extends Record<string, unknown> {}

let issueRows: Row[] = [];
let issueCategoryRows: Row[] = [];

/** What the write cores received: the probes for this whole file. */
let creates: Record<string, unknown>[] = [];
let updates: Record<string, unknown>[] = [];
let categorySets: Record<string, unknown>[] = [];
let metadataWrites: Record<string, unknown>[] = [];
let githubMetadataRows: Row[] = [];
let commentRows: Row[] = [];
let githubCommentSyncRows: Row[] = [];
/** How many times the assignee index was built (two queries each). */
let indexBuilds = 0;
/** Whether `createIssueForProject` fails, and on which key. */
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
  // The backfill-completion timestamp on `project_git_links`: written, never read.
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
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "sync_github_issue_comment_atomic") {
        return { data: null, error: { message: `Unexpected RPC: ${name}` } };
      }
      const synced = githubCommentSyncRows.find(
        (row) =>
          row.remote_comment_id === args.p_remote_comment_id &&
          row.issue_id === args.p_issue_id,
      );
      let commentId = synced?.comment_id as string | undefined;
      if (!commentId) {
        commentId = `inserted-${commentRows.length + 1}`;
        commentRows.push({
          id: commentId,
          issue_id: args.p_issue_id,
          author_id: args.p_author_id,
          body: args.p_body,
          created_at: args.p_created_at_remote,
        });
      } else {
        const comment = commentRows.find((row) => row.id === commentId);
        if (comment) comment.body = args.p_body;
      }
      const values = {
        remote_comment_id: args.p_remote_comment_id,
        issue_id: args.p_issue_id,
        comment_id: commentId,
        author_login: args.p_author_login,
        author_association: args.p_author_association,
        html_url: args.p_html_url,
        created_at_remote: args.p_created_at_remote,
        updated_at_remote: args.p_updated_at_remote,
        deleted_at_remote: args.p_deleted_at_remote,
      };
      if (synced) Object.assign(synced, values);
      else githubCommentSyncRows.push(values);
      return { data: { state: "synced", comment_id: commentId }, error: null };
    },
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

// Project labels: a stable id per name, so the test talks in names rather
// than uuids. The real function has its own tests (categories.test.ts), but
// its SENSITIVE POINT is reproduced here: the index is built with
// `categoryKey`, so it goes through truncation. A double that indexed on the
// full name would leave this file blind to what the real code does.
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

/** Batches passed to the bulk import: the backfill probe. */
let imports: Record<string, unknown>[] = [];
/** The open issues the forge returns to the backfill. */
let openIssues: Record<string, unknown>[] = [];
/** Whether the project has reached its issue cap. */
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

/** A forge issue event, in its neutral form. */
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

/** An issue ALREADY imported for this forge issue, as the database stores it. */
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

describe("applyRemoteIssue — the issue was never imported", () => {
  it("lands the issue in triage, with the forge issue link as a RESOURCE", async () => {
    await applyRemoteIssue(TARGET, remote());

    const input = creates[0].input as Record<string, unknown>;
    expect(input.status).toBe("triage");
    expect(input.title).toBe("Le bouton ne répond pas");
    expect(input.description).toBe("Sur Safari uniquement.");
    // The link opened from the panel, next to the files.
    expect(input.resources).toEqual([
      {
        kind: "link",
        url: "https://github.com/acme/app/issues/7",
        file_name: "acme/app#7",
        icon_data_url: expect.stringContaining("data:image/webp;base64,"),
      },
    ]);
    // The remote identity travels with the row: it is what deduplicates.
    expect(creates[0].remote).toEqual({
      provider: "github",
      repoId: "9001",
      number: 7,
      url: "https://github.com/acme/app/issues/7",
    });
  });

  it("lands in triage EVEN when closed: nobody has seen it yet", async () => {
    // Real case: an issue beyond the backfill ceiling, closed before minddy
    // knew about it. Creating it as `done` would bring it into the project
    // without it ever having existed for the team.
    await applyRemoteIssue(TARGET, remote({ action: "closed", state: "closed" }));

    expect((creates[0].input as Record<string, unknown>).status).toBe("triage");
  });

  it("splits labels into priority, effort, and categories for the rest", async () => {
    await applyRemoteIssue(
      TARGET,
      remote({ labels: ["P1", "size/M", "bug", "frontend"] }),
    );

    const input = creates[0].input as Record<string, unknown>;
    expect(input.priority).toBe("high");
    expect(input.effort).toBe("m");
    // “P1” and “size/M” were consumed: a “P1” column next to a “P2” column
    // tells nothing that sorting by priority does not say better.
    expect(categorySets[0].categoryIds).toEqual(["cat-bug", "cat-frontend"]);
  });

  it("maps the forge account to its minddy member", async () => {
    await applyRemoteIssue(TARGET, remote({ assigneeLogins: ["octocat"] }));

    expect((creates[0].input as Record<string, unknown>).assignee_id).toBe("user-dev");
  });

  it("leaves unassigned a login linked to nobody", async () => {
    await applyRemoteIssue(TARGET, remote({ assigneeLogins: ["inconnu"] }));

    expect((creates[0].input as Record<string, unknown>).assignee_id).toBeNull();
  });

  it("stays quiet on a webhook redelivery: that is the normal path", async () => {
    createError = "remoteIssueAlreadyImported";
    await applyRemoteIssue(TARGET, remote());

    expect(console.error).not.toHaveBeenCalled();
    expect(categorySets).toHaveLength(0);
  });

  it("logs a failure that is NOT a redelivery", async () => {
    createError = "issueLimitReached";
    await applyRemoteIssue(TARGET, remote());

    expect(console.error).toHaveBeenCalled();
  });

  it("does nothing at all when the link has no actor", async () => {
    await applyRemoteIssue({ ...TARGET, createdBy: null }, remote());

    expect(creates).toHaveLength(0);
  });
});

describe("applyRemoteIssue — the issue exists: silence overwrites nothing", () => {
  it("aligns the title and body, which follow unconditionally", async () => {
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

  it("writes NOTHING when the forge says nothing new", async () => {
    imported();
    await applyRemoteIssue(TARGET, remote({ action: "labeled" }));

    expect(updates).toHaveLength(0);
  });

  it("does not unassign when the forge names nobody", async () => {
    // The trap: on a repository that never assigns, the slightest `labeled`
    // webhook would clear the field someone just filled in minddy.
    imported({ assignee_id: "user-dev" });
    await applyRemoteIssue(TARGET, remote({ action: "labeled", assigneeLogins: [] }));

    expect(updates).toHaveLength(0);
  });

  it("does not clear the field for an unrecognized remote assignee", async () => {
    imported({ assignee_id: "user-dev" });
    await applyRemoteIssue(TARGET, remote({ assigneeLogins: ["inconnu"] }));

    expect(updates).toHaveLength(0);
  });

  it("does not reset the priority to `none` when the label disappears", async () => {
    imported({ priority: "urgent" });
    await applyRemoteIssue(TARGET, remote({ action: "unlabeled", labels: ["bug"] }));

    expect(patch()).toBeNull();
  });

  it("follows priority and effort when the forge carries them", async () => {
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

  it("stamps the write as `forgeSync`: that is THE LOOP GUARD", async () => {
    // Without this flag, `updateIssueFields` would push the status back to the
    // forge it just came from, which would send it back by webhook, endlessly.
    imported({ status: "todo" });
    await applyRemoteIssue(TARGET, remote({ action: "closed", state: "closed" }));

    expect(patch()).toEqual({ status: "done" });
    expect(updates[0].forgeSync).toBe("github");
    expect(updates[0].actorId).toBe("user-owner");
  });

  it("does not reclassify a deliberately CANCELED issue the forge closed", async () => {
    imported({ status: "canceled" });
    await applyRemoteIssue(TARGET, remote({ action: "edited", state: "closed" }));

    expect(updates).toHaveLength(0);
  });

  it("reopens into backlog, never triage: the issue has already been seen", async () => {
    imported({ status: "done" });
    await applyRemoteIssue(TARGET, remote({ action: "reopened", state: "open" }));

    expect(patch()).toEqual({ status: "backlog" });
  });

  it("builds the assignee index only when the forge issue names someone", async () => {
    imported();
    await applyRemoteIssue(TARGET, remote({ action: "labeled" }));
    expect(indexBuilds).toBe(0);

    await applyRemoteIssue(TARGET, remote({ assigneeLogins: ["octocat"] }));
    expect(indexBuilds).toBe(1);
  });

  it("ignores an issue from another project with the same remote number", async () => {
    imported({ id: "issue-ailleurs", project_id: "project-2" });
    await applyRemoteIssue(TARGET, remote());

    // Treated as never imported here: it is a CREATION, not a reconciliation.
    expect(creates).toHaveLength(1);
    expect(updates).toHaveLength(0);
  });

  it("ignores a deleted issue: it does not sneak back in", async () => {
    imported({ deleted_at: "2026-08-01T00:00:00Z" });
    await applyRemoteIssue(TARGET, remote());

    expect(creates).toHaveLength(1);
  });
});

describe("applyRemoteIssue — categories", () => {
  it("replaces the whole set: a label removed on the forge removes the category", async () => {
    imported();
    issueCategoryRows.push(
      { issue_id: "issue-1", category_id: "cat-bug" },
      { issue_id: "issue-1", category_id: "cat-frontend" },
    );
    await applyRemoteIssue(TARGET, remote({ labels: ["bug"] }));

    expect(categorySets[0].categoryIds).toEqual(["cat-bug"]);
    expect(categorySets[0].forgeSync).toBe("github");
  });

  it("rewrites NOTHING when the set is already right", async () => {
    // `setIssueCategories` runs a DELETE then an INSERT: replaying it on every
    // webhook would make categories flicker on every open board, in real
    // time, while nothing changed.
    imported();
    issueCategoryRows.push({ issue_id: "issue-1", category_id: "cat-bug" });
    await applyRemoteIssue(TARGET, remote({ labels: ["bug"] }));

    expect(categorySets).toHaveLength(0);
  });

  it("does not wipe categories when the forge has NO label", async () => {
    // The accepted price of not confusing “nothing to say” with “nothing”: a
    // repository that does not label its issues must not clear, on every
    // webhook, what was set by hand in minddy.
    imported();
    issueCategoryRows.push({ issue_id: "issue-1", category_id: "cat-maison" });
    await applyRemoteIssue(TARGET, remote({ labels: [] }));

    expect(categorySets).toHaveLength(0);
  });

  it("keeps a single copy of a category two labels point to", async () => {
    // Two labels that `readForgeLabels` keeps SEPARATE (their tokens differ)
    // but that the 200-character limit folds into the same category. A
    // repeated id would defeat the “nothing changed” comparison just above,
    // and the DELETE/INSERT would rerun on every webhook: the very flicker it
    // exists to prevent.
    const long = "z".repeat(240);
    imported();
    issueCategoryRows.push({ issue_id: "issue-1", category_id: `cat-${"z".repeat(200)}` });

    await applyRemoteIssue(TARGET, remote({ labels: [`${long}-a`, `${long}-b`] }));

    expect(categorySets).toHaveLength(0);
  });
});

describe("backfillRemoteIssues — the import when the toggle is enabled", () => {
  /** An open issue as `listRepoOpenIssues` returns it. */
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

  /** Issues from an import batch. */
  const batch = () => (imports[0]?.issues as Record<string, unknown>[]) ?? [];

  it("imports each issue into triage, with its link as a resource", async () => {
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

  it("SKIPS what the project already has: re-enabling the toggle duplicates nothing", async () => {
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

  it("imports NOTHING and skips the import call when everything is already there", async () => {
    imported({ remote_number: 7 });
    openIssues = [openIssue()];

    expect(await backfillRemoteIssues(TARGET)).toBe(0);
    expect(imports).toHaveLength(0);
  });

  it("splits labels and links the assignee, like the webhook", async () => {
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

  it("builds a SINGLE assignee index for the whole batch", async () => {
    // Two queries per batch, not two per issue: across 500 issues, that is
    // the difference between two queries and a thousand.
    openIssues = [openIssue(), openIssue({ number: 8 }), openIssue({ number: 9 })];
    await backfillRemoteIssues(TARGET);

    expect(indexBuilds).toBe(1);
  });

  it("gives up without throwing when the project has reached its issue cap", async () => {
    overIssueLimit = true;
    openIssues = [openIssue()];

    expect(await backfillRemoteIssues(TARGET)).toBe(0);
    expect(imports).toHaveLength(0);
  });

  it("does nothing when the link has no actor", async () => {
    openIssues = [openIssue()];

    expect(await backfillRemoteIssues({ ...TARGET, createdBy: null })).toBe(0);
    expect(imports).toHaveLength(0);
  });

  it("reads GitLab's vocabulary: `iid`, `description`, `webUrl`", async () => {
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
