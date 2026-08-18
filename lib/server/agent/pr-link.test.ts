import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-163bis — the manual attachment of a PR to a ticket, which has become the point of
 * passage of THREE surfaces (app dialog, MCP, Numo). What is tested here
 * is exactly what changes depending on the caller without having to change the response:
 * the scale of refusals, and the fact that an agent who replays his call finds a
 * success where the screen should see a conflict.
 *
 * The fake Supabase carries the only three forms of request from the heart: the list
 * of projects in a repository, the search for a living PR on a ticket, and
 * the CONDITIONAL writing of the link — it is this which makes the gesture atomic, and
 * the fake really applies it (otherwise the test would say nothing about the race).
 */

const PR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ISSUE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_ISSUE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROJECT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FOREIGN_PROJECT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REPO = "mangue-dev/minddy";

interface PrRow {
  id: string;
  provider: string;
  repo_full_name: string;
  number: number;
  state: string;
  issue_id: string | null;
  url: string | null;
  title: string | null;
}

const world = {
  /** Projects that link the repository (`project_git_links` + its embedded project). */
  links: [] as Array<{ provider: string; repo_full_name: string; project_id: string }>,
  prs: [] as PrRow[],
};

function makePr(over: Partial<PrRow> = {}): PrRow {
  return {
    id: PR_ID,
    provider: "github",
    repo_full_name: REPO,
    number: 42,
    state: "open",
    issue_id: null,
    url: `https://github.com/${REPO}/pull/42`,
    title: "Un titre sans référence",
    ...over,
  };
}

vi.mock("@/lib/supabase-service", () => {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inFilter: { column: string; values: unknown[] } | null = null;
    let patch: Record<string, unknown> | null = null;

    const rows = (): unknown[] => {
      if (table === "project_git_links") {
        return world.links
          .filter((l) =>
            Object.entries(filters).every(
              ([column, value]) => (l as Record<string, unknown>)[column] === value,
            ),
          )
          .map((l) => ({
            provider: l.provider,
            repo_full_name: l.repo_full_name,
            // Embedded to-one relationship: `projectsForRepo` reads `row.project`.
            project: { id: l.project_id, key: "MIN" },
          }));
      }
      return world.prs.filter(
        (pr) =>
          Object.entries(filters).every(
            ([column, value]) =>
              ((pr as unknown as Record<string, unknown>)[column] ?? null) === value,
          ) &&
          (!inFilter ||
            inFilter.values.includes(
              (pr as unknown as Record<string, unknown>)[inFilter.column],
            )),
      );
    };

    /** Conditional writing: it ONLY affects the lines that the
 filters retain — including `is("issue_id", null)`. */
    const applyUpdate = (): unknown[] => {
      const targets = rows() as PrRow[];
      for (const row of targets) Object.assign(row, patch);
      return targets.map((row) => ({ id: row.id }));
    };

    const query: Record<string, unknown> = {};
    const chain = () => query;
    query.select = chain;
    query.limit = chain;
    query.update = (values: Record<string, unknown>) => {
      patch = values;
      return query;
    };
    query.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.is = (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    };
    query.in = (column: string, values: unknown[]) => {
      inFilter = { column, values };
      return query;
    };
    // The scan buffers `pull_request_syncs`: nothing to observe here.
    query.upsert = async () => ({ error: null });
    query.maybeSingle = async () => {
      const found = patch ? applyUpdate() : rows();
      return { data: found[0] ?? null, error: null };
    };
    // Awaitable without `.maybeSingle()`: the form of list reads.
    query.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: patch ? applyUpdate() : rows(), error: null }).then(resolve);
    return query;
  };
  return { getServiceClient: () => ({ from }) };
});

const broadcast = vi.fn();
vi.mock("./pr-live", () => ({ broadcastPrChanged: (...a: unknown[]) => broadcast(...a) }));

const syncStatus = vi.fn();
vi.mock("./issue-status-sync", async () => {
  const { issueStatusForPrState } = await import("@/lib/pr-issue-status");
  return {
    issueStatusForPrState,
    syncIssueStatusFromPr: (...a: unknown[]) => syncStatus(...a),
  };
});

const cloneTarget = vi.fn(async () => null as { token: string } | null);
vi.mock("./repo-access", () => ({
  resolveRepoCloneTargetForRepo: (...a: unknown[]) => cloneTarget(...(a as [])),
}));

/** The scan reads the forge: we give it an empty deposit, which is enough to
 verify that it has indeed been ATTEMPTED before concluding “not found”. */
const sweep = vi.fn(async () => ({ pulls: [], truncated: false }));
vi.mock("./forge", () => ({
  forgeFor: () => ({ listPullRequests: sweep }),
}));

const { linkPullRequestToIssue, resolveProjectPullRequest } = await import("./pr-link");

beforeEach(() => {
  world.links = [{ provider: "github", repo_full_name: REPO, project_id: PROJECT_ID }];
  world.prs = [makePr()];
  broadcast.mockClear();
  syncStatus.mockClear();
  cloneTarget.mockClear();
  cloneTarget.mockResolvedValue(null);
});

const link = (over: { pr?: PrRow; issueId?: string; projectId?: string } = {}) =>
  linkPullRequestToIssue({
    pr: (over.pr ?? world.prs[0]) as never,
    issue: { id: over.issueId ?? ISSUE_ID, projectId: over.projectId ?? PROJECT_ID },
    actorId: "user-1",
  });

describe("linkPullRequestToIssue", () => {
  it("rattache une PR libre et aligne le statut du ticket", async () => {
    const result = await link();

    expect(result).toEqual({ ok: true, already: false, status: "in_review" });
    expect(world.prs[0].issue_id).toBe(ISSUE_ID);
    expect(broadcast).toHaveBeenCalledWith(PR_ID, ["pr"]);
    expect(syncStatus).toHaveBeenCalledWith({
      issueId: ISSUE_ID,
      actorId: "user-1",
      prState: "open",
    });
  });

  it("donne à chaque état de PR le statut que la table promet", async () => {
    for (const [state, status] of [
      ["draft", "in_progress"],
      ["merged", "done"],
      ["closed", "todo"],
    ] as const) {
      world.prs = [makePr({ state })];
      await expect(link()).resolves.toMatchObject({ ok: true, status });
    }
  });

  it("rejouer le MÊME rattachement est un succès, sans rien réécrire", async () => {
    world.prs = [makePr({ issue_id: ISSUE_ID })];

    const result = await link();

    expect(result).toEqual({ ok: true, already: true, status: "in_review" });
    // The gesture is already done: no distribution, no rewritten status.
    expect(broadcast).not.toHaveBeenCalled();
    expect(syncStatus).not.toHaveBeenCalled();
  });

  it("refuse une PR déjà rattachée à un AUTRE ticket", async () => {
    world.prs = [makePr({ issue_id: OTHER_ISSUE_ID })];

    await expect(link()).resolves.toEqual({ ok: false, code: "pr_already_linked" });
    expect(world.prs[0].issue_id).toBe(OTHER_ISSUE_ID);
  });

  it("refuse un ticket dont le projet ne lie pas ce dépôt", async () => {
    await expect(link({ projectId: FOREIGN_PROJECT_ID })).resolves.toEqual({
      ok: false,
      code: "issue_outside_repo",
    });
    expect(world.prs[0].issue_id).toBeNull();
  });

  it("refuse un ticket qui porte déjà une PR VIVANTE", async () => {
    world.prs = [makePr(), makePr({ id: "pr-2", number: 7, state: "draft", issue_id: ISSUE_ID })];

    await expect(link({ pr: world.prs[0] })).resolves.toEqual({
      ok: false,
      code: "issue_already_linked",
    });
  });

  it("accepte un ticket dont les PR précédentes sont TERMINALES", async () => {
    // A ticket that Numo has taken up several times legitimately has a string of PRs:
    // it’s the uniqueness of “a LIVING PR”, not “a PR”.
    world.prs = [makePr(), makePr({ id: "pr-2", number: 7, state: "merged", issue_id: ISSUE_ID })];

    await expect(link({ pr: world.prs[0] })).resolves.toMatchObject({ ok: true });
  });
});

describe("resolveProjectPullRequest", () => {
  const resolve = (ref: string | number | null | undefined, projectId = PROJECT_ID) =>
    resolveProjectPullRequest({ projectId, ref, userId: "user-1" });

  it("trouve la PR du dépôt lié, par numéro comme par URL", async () => {
    await expect(resolve("#42")).resolves.toEqual({ pr: world.prs[0] });
    await expect(resolve(`https://github.com/${REPO}/pull/42`)).resolves.toEqual({
      pr: world.prs[0],
    });
  });

  it("refuse une référence qui ne désigne pas une pull request", async () => {
    await expect(resolve("MIN-42")).resolves.toEqual({ error: "invalid_ref" });
  });

  it("dit qu'il n'y a pas de dépôt plutôt que « introuvable »", async () => {
    world.links = [];
    await expect(resolve("#42")).resolves.toEqual({ error: "no_repository" });
  });

  it("balaye le dépôt avant d'abandonner sur un numéro inconnu", async () => {
    cloneTarget.mockResolvedValue({ token: "t" });

    await expect(resolve("#404")).resolves.toEqual({ error: "not_found" });
    // The catch-up has taken place: a PR opened thirty seconds ago on a
    // repository without webhook is not yet in base, and “not found” would be false.
    expect(cloneTarget).toHaveBeenCalled();
    expect(sweep).toHaveBeenCalled();
  });

  it("ne fait pas tomber la résolution quand la forge est en panne", async () => {
    cloneTarget.mockRejectedValue(new Error("forge down"));
    await expect(resolve("#404")).resolves.toEqual({ error: "not_found" });
  });
});
