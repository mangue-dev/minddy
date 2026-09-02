import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-292 — a pull request opened by a NOTEBOOK session does have a lineage.
 *
 * The defect was read on the screen: on a Numo PR born from the notebook, "request
 * changes" responded "Numo has never worked on this pull request."
 * The branch existed, however, and the run that pushed it too — what was missing,
 * was a TICKET, the only index that `inheritableWorkForIssue` knows how to query.
 *
 * What is kept here is the BRANCH of the launch: which line is read
 * (the ticket, or the PR), and what the cold run receives from it at its creation. The rest
 * of `launchAgentRun` — quota, model, drain — is mocked: it is not the subject,
 * and nothing in this path should change depending on the anchor.
 */

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PR_ID = "22222222-2222-4222-8222-222222222222";
const ISSUE_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const REPO = "mangue-dev/minddy-issues";

const h = vi.hoisted(() => ({
  /** What `createRun` received — that's where the inheritance reads. */
  created: [] as Array<Record<string, unknown>>,
  /** Lineage rendered by the TICKET index, and by the PULL REQUEST index. */
  issueLineage: null as Record<string, unknown> | null,
  prLineage: null as Record<string, unknown> | null,
  /** Active runs seen by each uniqueness guard. */
  activeIssue: null as Record<string, unknown> | null,
  activePr: null as Record<string, unknown> | null,
  /** Which uniqueness guard was queried. */
  activeCalls: [] as string[],
  /** The PR that `loadPrRunContext` returns, or null (PR gone). */
  pr: null as Record<string, unknown> | null,
  /** Current forge response used before inheriting a branch without Numo lineage. */
  livePr: null as Record<string, unknown> | null,
  agentModelCalls: [] as Array<Record<string, unknown>>,
  reviewModelCalls: [] as Array<Record<string, unknown>>,
  reviewResolvedModel: "model/review",
  quotaMode: "platform" as "platform" | "byok",
  byok: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const query: Record<string, unknown> = {};
      const chain = () => query;
      query.select = chain;
      query.eq = chain;
      query.is = chain;
      query.insert = async () => ({ error: null });
      query.maybeSingle = async () => ({
        data: { id: ISSUE_ID, project_id: PROJECT_ID, title: "A ticket" },
        error: null,
      });
      return query;
    },
  }),
}));

vi.mock("./runs", () => ({
  ActiveRunExistsError: class ActiveRunExistsError extends Error {},
  createRun: vi.fn(async (input: Record<string, unknown>) => {
    h.created.push(input);
    return { id: RUN_ID, ...input };
  }),
  activeRunForIssue: vi.fn(async () => {
    h.activeCalls.push("issue");
    return h.activeIssue;
  }),
  activeRunForPrNumber: vi.fn(async () => {
    h.activeCalls.push("pr");
    return h.activePr;
  }),
  activeRunForPullRequest: vi.fn(async () => null),
  activeRunForRoutine: vi.fn(async () => null),
  inheritableWorkForIssue: vi.fn(async () => h.issueLineage),
  inheritableWorkForPr: vi.fn(async () => h.prLineage),
  insertRunMessage: vi.fn(async () => {}),
  bumpRunActivity: vi.fn(async () => {}),
}));

vi.mock("./pr-run", () => ({
  loadPrRunContext: vi.fn(async () => h.pr),
}));

vi.mock("./repo-access", () => ({
  resolveProjectLinkForRepo: vi.fn(async () => ({
    projectId: PROJECT_ID,
    linkId: "link-1",
    connectionId: "conn-1",
  })),
  resolveRepoCloneTargetForRepo: vi.fn(async () => ({ token: "repo-token" })),
}));

vi.mock("./forge", () => ({
  forgeFor: vi.fn(() => ({
    getPullRequest: vi.fn(async () => h.livePr),
  })),
}));

vi.mock("@/lib/server/git/repo-links", () => ({
  getProjectLink: vi.fn(async () => ({
    id: "link-1",
    connection_id: "conn-1",
    provider: "github",
    repo_full_name: REPO,
  })),
}));

vi.mock("./quota", () => ({
  checkAgentQuota: vi.fn(async () =>
    h.quotaMode === "byok"
      ? { allowed: true, mode: "byok", cap: null, periodStart: null }
      : {
          allowed: true,
          mode: "platform",
          cap: 5,
          periodStart: "2026-08-01T00:00:00.000Z",
        },
  ),
}));

vi.mock("./model", () => ({
  AgentModelRequiredError: class AgentModelRequiredError extends Error {},
  getUserByok: vi.fn(async () => h.byok),
  resolveAgentModel: vi.fn(async (input: Record<string, unknown>) => {
    h.agentModelCalls.push(input);
    return { model: "model/agent", chosenByUser: false };
  }),
  resolveReasoningLevel: vi.fn(async () => "medium"),
  resolvePrReviewModel: vi.fn(async (input: Record<string, unknown>) => {
    h.reviewModelCalls.push(input);
    return { model: h.reviewResolvedModel, chosenByUser: false };
  }),
}));

vi.mock("./model-plan", () => ({ ensureModelInPlan: vi.fn(async () => {}) }));
vi.mock("./drain", () => ({ drainAgentRuns: vi.fn(async () => ({ claimed: 0 })) }));
vi.mock("./drain-chain", () => ({ chainAgentDrain: vi.fn(async () => {}) }));
vi.mock("./issue-status-sync", () => ({ syncIssueStatusOnAgentStart: vi.fn(async () => {}) }));
vi.mock("@/lib/server/issue-events", () => ({ insertEvents: vi.fn(async () => {}) }));
vi.mock("@/lib/server/automations/hooks", () => ({ handOffToHuman: vi.fn(() => {}) }));
vi.mock("@/lib/server/short-title", () => ({ generateShortTitle: vi.fn(async () => "A title") }));
// The drain leaves in `after()`: here it does not leave at all, nothing to observe.
vi.mock("next/server", () => ({ after: vi.fn(() => {}) }));

const { launchAgentRun } = await import("./launch");

const lineage = (over: Record<string, unknown> = {}) => ({
  branchName: "minddy/agent/note-92275fe4",
  baseBranch: "main",
  prNumber: 51,
  prUrl: `https://github.com/${REPO}/pull/51`,
  prState: "open",
  ...over,
});

beforeEach(() => {
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel");
  vi.stubEnv("VERCEL", "1");
  h.created = [];
  h.activeCalls = [];
  h.issueLineage = null;
  h.prLineage = lineage();
  h.activeIssue = null;
  h.activePr = null;
  h.agentModelCalls = [];
  h.reviewModelCalls = [];
  h.reviewResolvedModel = "model/review";
  h.quotaMode = "platform";
  h.byok = null;
  h.pr = {
    id: PR_ID,
    provider: "github",
    repoFullName: REPO,
    number: 51,
    title: "Align page slash menu with scratchpad",
    state: "open",
    headBranch: "minddy/agent/note-92275fe4",
    baseBranch: "main",
    headSha: "abc123",
    issueId: null,
  };
  h.livePr = {
    number: 51,
    url: `https://github.com/${REPO}/pull/51`,
    state: "open",
    head: "minddy/agent/note-92275fe4",
    headLabel: "mangue-dev:minddy/agent/note-92275fe4",
    base: "main",
  };
});

const relaunch = (over: Record<string, unknown> = {}) =>
  launchAgentRun({
    continuePullRequestId: PR_ID,
    userId: USER_ID,
    triggeredBy: "button",
    prompt: "Fix the naming",
    ...over,
  });

describe("continuing a pull request without a ticket", () => {
  it("inherits the branch from the PR and remains a notebook run", async () => {
    const result = await relaunch();

    expect(result.ok).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({
      // Without a ticket: the run is not anchored to anything other than its work.
      issueId: null,
      projectId: PROJECT_ID,
      // And he starts from the PR branch, not from a new branch.
      branchName: "minddy/agent/note-92275fe4",
      baseBranch: "main",
      prNumber: 51,
      prState: "open",
    });
  });

  it("uses the current PR head when no prior Numo run exists", async () => {
    h.prLineage = null;
    h.livePr = {
      ...h.livePr,
      head: "minddy/agent/note-current-head",
      headLabel: "mangue-dev:minddy/agent/note-current-head",
    };

    const result = await relaunch();

    expect(result.ok).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({
      branchName: "minddy/agent/note-current-head",
      baseBranch: "main",
      prNumber: 51,
      prState: "open",
    });
  });

  it("refuses a fork head when no prior Numo run proves a writable lineage", async () => {
    h.prLineage = null;
    h.livePr = {
      ...h.livePr,
      head: "minddy/agent/note-92275fe4",
      headLabel: "outside-contributor:minddy/agent/note-92275fe4",
    };

    await expect(relaunch()).resolves.toEqual({ ok: false, error: "prNoBranch" });
    expect(h.created).toHaveLength(0);
  });

  it("refuses when a run is already working on this PR", async () => {
    h.activePr = { id: "autre-run" };

    const result = await relaunch();

    expect(result).toMatchObject({ ok: false, error: "alreadyRunning" });
    expect(h.activeCalls).toEqual(["pr"]);
    expect(h.created).toHaveLength(0);
  });

  it("refuses a missing PR rather than opening an unrelated notebook run", async () => {
    h.pr = null;

    await expect(relaunch()).resolves.toEqual({ ok: false, error: "prNotFound" });
    expect(h.created).toHaveLength(0);
  });

  it("requires an instruction so the session has a mission", async () => {
    await expect(relaunch({ prompt: "   " })).resolves.toEqual({
      ok: false,
      error: "promptRequired",
    });
  });
});

describe("an explicit PR keeps priority", () => {
  it("reads the PR lineage when it is linked to a ticket", async () => {
    h.pr = { ...h.pr, issueId: ISSUE_ID };
    h.issueLineage = lineage({ branchName: "minddy/agent/min-249-f80dca09", prNumber: 49 });
    h.prLineage = lineage({ branchName: "minddy/agent/note-92275fe4", prNumber: 51 });

    const result = await relaunch({ issueId: ISSUE_ID });

    expect(result.ok).toBe(true);
    expect(h.activeCalls).toEqual(["pr"]);
    expect(h.created[0]).toMatchObject({
      issueId: ISSUE_ID,
      branchName: "minddy/agent/note-92275fe4",
      prNumber: 51,
    });
  });
});

describe("a pull-request review session", () => {
  it("uses the dedicated review model and always isolates local checkout", async () => {
    const result = await launchAgentRun({
      pullRequestId: PR_ID,
      userId: USER_ID,
      triggeredBy: "button",
      localExec: true,
      localWorktree: false,
      localIssueContextConfirmed: true,
    });

    expect(result.ok).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({
      pullRequestId: PR_ID,
      intent: "review",
      model: "model/review",
      localExec: true,
      localWorktree: true,
      localIssueContextConfirmed: true,
    });
    expect(h.reviewModelCalls).toEqual([
      { perCall: undefined, userId: USER_ID },
    ]);
    expect(h.agentModelCalls).toEqual([]);
  });

  it("uses a provider-compatible default review model for BYOK", async () => {
    h.quotaMode = "byok";
    h.reviewResolvedModel = "gpt-5.6-sol";
    h.byok = {
      provider: "openai",
      apiKey: "user-key",
      baseUrl: "https://api.openai.com/v1",
      enabledSurfaces: ["agent"],
      featureModels: {},
    };

    const result = await launchAgentRun({
      pullRequestId: PR_ID,
      userId: USER_ID,
      triggeredBy: "button",
      localExec: true,
      localIssueContextConfirmed: true,
    });

    expect(result.ok).toBe(true);
    expect(h.created[0]).toMatchObject({
      pullRequestId: PR_ID,
      model: "gpt-5.6-sol",
      keyMode: "byok",
    });
  });
});
