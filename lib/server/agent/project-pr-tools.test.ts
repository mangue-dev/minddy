import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The pull requests OF THE PROJECT, seen and acted upon from an ordinary run (MIN-267).
 *
 * What is tested here is what no tool description guarantees:
 * - the LIST is read in base, with the filters that we asked for, and it says
 * when it has been cut off — a routine that makes "this week's PRs" on
 * an unknowingly truncated window makes a false report;
 * - the catch-up scan only takes place if the list has aged;
 * - the DIFF does not leave without being asked (the cost of a review of fifteen
 * PR depends on that), and what is not readable at the forge (checks, reviews)
 * is worth `null` without dropping the reading;
 * - an anchor outside of diff NEVER leaves at the forge, and the ceiling of anchors
 * is that of RUN, all pull requests combined;
 * - IRREVERSIBLE gestures are limited before the call: a merge
 * method that the forge does not offer is refused here, and a forge refusal returns to the
 * model as an exploitable error rather than as an exception.
 */

const REPO = "mangue-dev/minddy";

interface PrRow {
  number: number;
  title: string | null;
  state: string;
  url: string | null;
  author_login: string | null;
  head_branch: string | null;
  base_branch: string | null;
  opened_at: string | null;
  merged_at: string | null;
  updated_at: string;
  issue: { number: number; title: string; project: { key: string } | null } | null;
}

const world = {
  rows: [] as PrRow[],
  /** What the query actually asked for — the test reads that, not an intent. */
  query: {} as {
    eq?: Record<string, unknown>;
    in?: { column: string; values: unknown[] };
    ilike?: [string, unknown];
    gte?: [string, unknown];
    limit?: number;
  },
};

vi.mock("@/lib/supabase-service", () => {
  const from = () => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    q.select = chain;
    q.order = chain;
    q.eq = (column: string, value: unknown) => {
      world.query.eq = { ...world.query.eq, [column]: value };
      return q;
    };
    q.in = (column: string, values: unknown[]) => {
      world.query.in = { column, values };
      return q;
    };
    q.ilike = (column: string, value: unknown) => {
      world.query.ilike = [column, value];
      return q;
    };
    q.gte = (column: string, value: unknown) => {
      world.query.gte = [column, value];
      return q;
    };
    q.limit = (n: number) => {
      world.query.limit = n;
      return q;
    };
    q.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: world.rows.slice(0, world.query.limit ?? 30), error: null }).then(
        resolve,
      );
    return q;
  };
  return { getServiceClient: () => ({ from }) };
});

const sweep = vi.fn(async () => ({ count: 0, truncated: false }));
let stale = false;
vi.mock("./pull-requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pull-requests")>()),
  readRepoSyncStates: vi.fn(async () => new Map()),
  needsRepoSync: vi.fn(() => stale),
  syncRepoPullRequests: (...a: unknown[]) => sweep(...(a as [])),
}));

const forge = {
  provider: "github" as const,
  mergeMethods: ["squash", "merge", "rebase"] as const,
  getPullRequest: vi.fn(),
  listPullRequestFiles: vi.fn(),
  listPullRequestReviewComments: vi.fn(),
  listReviewThreads: vi.fn(),
  listPullRequestComments: vi.fn(),
  listReviews: vi.fn(),
  listChecks: vi.fn(),
  createPullRequestComment: vi.fn(),
  createPullRequestReviewComment: vi.fn(),
  replyToPullRequestReviewComment: vi.fn(),
  submitReview: vi.fn(),
  mergePullRequest: vi.fn(),
  closePullRequest: vi.fn(),
  reopenPullRequest: vi.fn(),
  markReadyForReview: vi.fn(),
};

vi.mock("./forge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./forge")>()),
  forgeFor: () => forge,
}));

const { executeProjectPrTool } = await import("./project-pr-tools");
type ProjectPrToolContext = import("./project-pr-tools").ProjectPrToolContext;
const { GithubApiError } = await import("./pr");
const { AI_REVIEW_MAX_INLINE_COMMENTS } = await import("./tools");

/** Un hunk qui commence ligne 10 : contexte 10, `-`11 / `+`11, contexte 12. */
const PATCH = [
  "@@ -10,3 +10,3 @@",
  " const a = 1;",
  "-const b = 2;",
  "+const b = 3;",
  " const c = 4;",
  "",
].join("\n");

function makeRow(over: Partial<PrRow> = {}): PrRow {
  return {
    number: 42,
    title: "Un titre",
    state: "open",
    url: `https://github.com/${REPO}/pull/42`,
    author_login: "octocat",
    head_branch: "numo/min-1",
    base_branch: "main",
    opened_at: "2026-08-03T09:00:00Z",
    merged_at: null,
    updated_at: "2026-08-08T09:00:00Z",
    issue: { number: 7, title: "Le ticket", project: { key: "MIN" } },
    ...over,
  };
}

let noRepo = false;
let inline: { used: number };

function ctx(): ProjectPrToolContext {
  return {
    projectId: "project-1",
    repo: async () =>
      noRepo ? null : { token: "tok", repoFullName: REPO, provider: "github" as const },
    model: "openai/gpt-5.6",
    locale: "fr",
    inline,
  };
}

const call = (name: string, args: Record<string, unknown> = {}) =>
  executeProjectPrTool(ctx(), name, args);

beforeEach(() => {
  world.rows = [makeRow()];
  world.query = {};
  stale = false;
  noRepo = false;
  inline = { used: 0 };
  sweep.mockClear();
  for (const fn of Object.values(forge)) {
    if (typeof fn === "function" && "mockReset" in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  forge.getPullRequest.mockResolvedValue({
    number: 42,
    url: `https://github.com/${REPO}/pull/42`,
    state: "open",
    draft: false,
    merged: false,
    title: "Un titre",
    body: "Un corps",
    head: "numo/min-1",
    base: "main",
    headSha: "abc123",
    nodeId: "PR_kwn",
    user: { login: "octocat", avatar_url: null },
  });
  forge.listPullRequestFiles.mockResolvedValue({
    files: [
      { filename: "lib/demo.ts", status: "modified", additions: 1, deletions: 1, patch: PATCH },
    ],
    truncated: false,
  });
  forge.listPullRequestReviewComments.mockResolvedValue([]);
  forge.listReviewThreads.mockResolvedValue([]);
  forge.listPullRequestComments.mockResolvedValue([]);
  forge.listReviews.mockResolvedValue({ approvals: 1, changesRequested: 0 });
  forge.listChecks.mockResolvedValue({ checks: [], state: "success", passing: 3, total: 3 });
});

describe("list_pull_requests", () => {
  it("passe ses filtres à la requête et compose l'identifiant du ticket", async () => {
    const res = await call("list_pull_requests", {
      state: ["open", "merged"],
      author: "@octocat",
      updated_since: "2026-08-03",
      limit: 5,
    });
    expect(res.success).toBe(true);
    expect(world.query.eq).toMatchObject({ provider: "github", repo_full_name: REPO });
    expect(world.query.in).toEqual({ column: "state", values: ["open", "merged"] });
    // The at sign that the model copies from the thread is not part of the login.
    expect(world.query.ilike).toEqual(["author_login", "octocat"]);
    expect(world.query.gte?.[0]).toBe("updated_at");
    expect(world.query.limit).toBe(5);

    const body = res.result as { pull_requests: Array<{ issue: { identifier: string } }> };
    expect(body.pull_requests[0].issue.identifier).toBe("MIN-7");
  });

  it("dit que la liste a été COUPÉE quand elle bute sur la limite", async () => {
    world.rows = [makeRow({ number: 1 }), makeRow({ number: 2 })];
    const res = await call("list_pull_requests", { limit: 2 });
    expect((res.result as { truncated: boolean }).truncated).toBe(true);

    const short = await call("list_pull_requests", { limit: 30 });
    expect((short.result as { truncated: boolean }).truncated).toBe(false);
  });

  it("refuse un état inconnu plutôt que de le laisser filtrer dans le vide", async () => {
    const res = await call("list_pull_requests", { state: "en_cours" });
    expect(res.success).toBe(false);
    expect(String((res.result as { error: string }).error)).toContain("draft");
  });

  it("ne balaie la forge que si la liste a vieilli", async () => {
    await call("list_pull_requests");
    expect(sweep).not.toHaveBeenCalled();

    stale = true;
    await call("list_pull_requests");
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it("un balayage en échec ne fait pas tomber la liste", async () => {
    stale = true;
    sweep.mockRejectedValueOnce(new Error("forge injoignable"));
    const res = await call("list_pull_requests");
    expect(res.success).toBe(true);
  });

  it("sans dépôt lié, le dit sans appeler la forge", async () => {
    noRepo = true;
    const res = await call("list_pull_requests");
    expect(res.success).toBe(false);
    expect(sweep).not.toHaveBeenCalled();
  });
});

describe("read_pull_request", () => {
  it("ne rend PAS le diff sans include_diff, et le dit", async () => {
    const res = await call("read_pull_request", { pull_request: 42 });
    const body = res.result as {
      files: Array<Record<string, unknown>>;
      diff_omitted?: string;
    };
    expect(body.files[0]).not.toHaveProperty("patch");
    expect(body.diff_omitted).toContain("include_diff");
  });

  it("rend les patches quand on les demande", async () => {
    const res = await call("read_pull_request", { pull_request: 42, include_diff: true });
    const body = res.result as { files: Array<{ patch: string }>; diff_omitted?: string };
    expect(body.files[0].patch).toContain("const b = 3;");
    expect(body.diff_omitted).toBeUndefined();
  });

  it("checks illisibles = null, et la lecture passe quand même", async () => {
    forge.listChecks.mockRejectedValue(new Error("permission refusée"));
    forge.listReviews.mockRejectedValue(new Error("pas d'objet review"));
    const res = await call("read_pull_request", { pull_request: 42 });
    expect(res.success).toBe(true);
    expect((res.result as { checks: unknown }).checks).toBeNull();
    expect((res.result as { reviews: unknown }).reviews).toBeNull();
  });

  it("exige un numéro de pull request", async () => {
    const res = await call("read_pull_request", {});
    expect(res.success).toBe(false);
    expect(forge.getPullRequest).not.toHaveBeenCalled();
  });
});

describe("les écritures", () => {
  it("signe la synthèse exactement une fois", async () => {
    forge.createPullRequestComment.mockResolvedValue({ id: 1, html_url: "u" });
    await call("comment_pull_request", { pull_request: 42, body: "Ça me va." });
    const body = forge.createPullRequestComment.mock.calls[0][0].body as string;
    expect(body).toContain("Relu par Numo");
    expect(body.match(/Relu par Numo/g)).toHaveLength(1);
  });

  it("refuse une ancre hors diff SANS appeler la forge, et rend les plages", async () => {
    const res = await call("comment_pull_request_line", {
      pull_request: 42,
      path: "lib/demo.ts",
      line: 999,
      body: "non",
    });
    expect(res.success).toBe(false);
    expect(String((res.result as { error: string }).error)).toContain("10");
    expect(forge.createPullRequestReviewComment).not.toHaveBeenCalled();
    expect(inline.used).toBe(0);
  });

  it("consomme le plafond du RUN, toutes pull requests confondues", async () => {
    forge.createPullRequestReviewComment.mockResolvedValue({ id: 9, html_url: "u" });
    const ok = await call("comment_pull_request_line", {
      pull_request: 42,
      path: "lib/demo.ts",
      line: 11,
      body: "ici",
    });
    expect(ok.success).toBe(true);
    expect(inline.used).toBe(1);

    inline.used = AI_REVIEW_MAX_INLINE_COMMENTS;
    const refused = await call("comment_pull_request_line", {
      pull_request: 7,
      path: "lib/demo.ts",
      line: 11,
      body: "ailleurs",
    });
    expect(refused.success).toBe(false);
    // The ceiling decides BEFORE any appeal: nothing has been reread or placed.
    expect(forge.createPullRequestReviewComment).toHaveBeenCalledTimes(1);
  });

  it("un refus de forge revient en erreur de tool, pas en exception", async () => {
    forge.createPullRequestReviewComment.mockRejectedValue(
      new GithubApiError("head moved", 422),
    );
    const res = await call("comment_pull_request_line", {
      pull_request: 42,
      path: "lib/demo.ts",
      line: 11,
      body: "ici",
    });
    expect(res.success).toBe(false);
    expect(String((res.result as { error: string }).error)).toContain("422");
    // Nothing has been set: the ceiling is not consumed on a failure.
    expect(inline.used).toBe(0);
  });
});

describe("review_pull_request", () => {
  it("refuse un verdict inconnu et un verdict sans motif", async () => {
    expect((await call("review_pull_request", { pull_request: 42, verdict: "lgtm", body: "x" })).success).toBe(false);
    expect((await call("review_pull_request", { pull_request: 42, verdict: "approve" })).success).toBe(false);
    expect(forge.submitReview).not.toHaveBeenCalled();
  });

  it("dit quand la forge a REFUSÉ le verdict et l'a publié en commentaire", async () => {
    forge.submitReview.mockResolvedValue({ published: "comment" });
    const res = await call("review_pull_request", {
      pull_request: 42,
      verdict: "approve",
      body: "Rien à redire.",
    });
    expect(res.success).toBe(true);
    const body = res.result as { published: string; note?: string };
    expect(body.published).toBe("comment");
    expect(body.note).toContain("Nothing was approved");
  });

  it("signe le corps du verdict, comme une synthèse", async () => {
    forge.submitReview.mockResolvedValue({ published: "review" });
    await call("review_pull_request", {
      pull_request: 42,
      verdict: "request_changes",
      body: "Il manque le test.",
    });
    expect(forge.submitReview.mock.calls[0][0].body).toContain("Relu par Numo");
  });
});

describe("set_pull_request_state", () => {
  it("fusionne, méthode comprise", async () => {
    forge.mergePullRequest.mockResolvedValue(undefined);
    const res = await call("set_pull_request_state", {
      pull_request: 42,
      state: "merged",
      merge_method: "squash",
    });
    expect(res.success).toBe(true);
    expect(forge.mergePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ number: 42, method: "squash" }),
    );
  });

  it("refuse une méthode que la forge n'offre pas, AVANT de fusionner", async () => {
    const res = await call("set_pull_request_state", {
      pull_request: 42,
      state: "merged",
      merge_method: "fast-forward",
    });
    expect(res.success).toBe(false);
    expect(String((res.result as { error: string }).error)).toContain("squash");
    expect(forge.mergePullRequest).not.toHaveBeenCalled();
  });

  it("un merge refusé par la forge rend l'erreur, avec de quoi comprendre", async () => {
    forge.mergePullRequest.mockRejectedValue(new GithubApiError("Base branch was modified", 405));
    const res = await call("set_pull_request_state", { pull_request: 42, state: "merged" });
    expect(res.success).toBe(false);
    expect(String((res.result as { error: string }).error)).toContain("mergeable_state");
  });

  it("sort un brouillon de son état de brouillon avec son node id", async () => {
    forge.getPullRequest.mockResolvedValue({
      number: 42,
      url: "u",
      state: "open",
      draft: true,
      nodeId: "PR_kwn",
    });
    forge.markReadyForReview.mockResolvedValue(undefined);
    const res = await call("set_pull_request_state", {
      pull_request: 42,
      state: "ready_for_review",
    });
    expect(res.success).toBe(true);
    expect(forge.markReadyForReview).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "PR_kwn" }),
    );
  });

  it("sur une PR qui n'est pas un brouillon, ne touche à rien", async () => {
    const res = await call("set_pull_request_state", {
      pull_request: 42,
      state: "ready_for_review",
    });
    expect(res.success).toBe(true);
    expect(forge.markReadyForReview).not.toHaveBeenCalled();
  });

  it("refuse un état inconnu", async () => {
    const res = await call("set_pull_request_state", { pull_request: 42, state: "rebased" });
    expect(res.success).toBe(false);
  });
});

describe("routage", () => {
  it("un nom inconnu ne lève pas", async () => {
    const res = await call("merge_everything");
    expect(res.success).toBe(false);
  });
});
