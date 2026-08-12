import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-292 — une pull request ouverte par une session CARNET a bien une lignée.
 *
 * Le défaut se lisait à l'écran : sur une PR de Numo née du carnet, « demander
 * des changements » répondait « Numo n'a jamais travaillé sur cette pull request ».
 * La branche existait pourtant, et le run qui l'a poussée aussi — ce qui manquait,
 * c'était un TICKET, seul index que `inheritableWorkForIssue` sait interroger.
 *
 * Ce qui est gardé ici, c'est le BRANCHEMENT du lancement : quelle lignée est lue
 * (le ticket, ou la PR), et ce que la run froide en reçoit à sa création. Le reste
 * de `launchAgentRun` — quota, modèle, drain — est moqué : il n'est pas le sujet,
 * et rien de ce chemin ne doit changer selon l'ancrage.
 */

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PR_ID = "22222222-2222-4222-8222-222222222222";
const ISSUE_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const REPO = "mangue-dev/minddy-issues";

const h = vi.hoisted(() => ({
  /** Ce que `createRun` a reçu — c'est là que l'héritage se lit. */
  created: [] as Array<Record<string, unknown>>,
  /** Lignée rendue par l'index TICKET, et par l'index PULL REQUEST. */
  issueLineage: null as Record<string, unknown> | null,
  prLineage: null as Record<string, unknown> | null,
  /** Runs actifs vus par chacune des deux gardes. */
  activeIssue: null as Record<string, unknown> | null,
  activePr: null as Record<string, unknown> | null,
  /** Quelle garde d'unicité a été interrogée. */
  activeCalls: [] as string[],
  /** La PR que `loadPrRunContext` rend, ou null (PR disparue). */
  pr: null as Record<string, unknown> | null,
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
        data: { id: ISSUE_ID, project_id: PROJECT_ID, title: "Un ticket" },
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
  checkAgentQuota: vi.fn(async () => ({ allowed: true, mode: "platform" })),
}));

vi.mock("./model", () => ({
  AgentModelRequiredError: class AgentModelRequiredError extends Error {},
  resolveAgentModel: vi.fn(async () => ({ model: "modele/test", chosenByUser: false })),
  resolveReasoningLevel: vi.fn(async () => "medium"),
  resolvePrReviewModel: vi.fn(async () => ({ model: "modele/test", chosenByUser: false })),
}));

vi.mock("./model-plan", () => ({ ensureModelInPlan: vi.fn(async () => {}) }));
vi.mock("./drain", () => ({ drainAgentRuns: vi.fn(async () => ({ claimed: 0 })) }));
vi.mock("./drain-chain", () => ({ chainAgentDrain: vi.fn(async () => {}) }));
vi.mock("./issue-status-sync", () => ({ syncIssueStatusOnAgentStart: vi.fn(async () => {}) }));
vi.mock("@/lib/server/issue-events", () => ({ insertEvents: vi.fn(async () => {}) }));
vi.mock("@/lib/server/automations/hooks", () => ({ handOffToHuman: vi.fn(() => {}) }));
vi.mock("@/lib/server/short-title", () => ({ generateShortTitle: vi.fn(async () => "Un titre") }));
// Le drain part en `after()` : ici il ne part pas du tout, rien à observer.
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
  h.created = [];
  h.activeCalls = [];
  h.issueLineage = null;
  h.prLineage = lineage();
  h.activeIssue = null;
  h.activePr = null;
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
});

const relaunch = (over: Record<string, unknown> = {}) =>
  launchAgentRun({
    continuePullRequestId: PR_ID,
    userId: USER_ID,
    triggeredBy: "button",
    prompt: "Corrige le nommage",
    ...over,
  });

describe("reprise d'une pull request sans ticket", () => {
  it("hérite de la branche portée par la PR, et reste un run carnet", async () => {
    const result = await relaunch();

    expect(result.ok).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({
      // Sans ticket : le run ne s'ancre à rien d'autre que son travail.
      issueId: null,
      projectId: PROJECT_ID,
      // Et il repart de la branche de la PR, pas d'une branche neuve.
      branchName: "minddy/agent/note-92275fe4",
      baseBranch: "main",
      prNumber: 51,
      prState: "open",
    });
  });

  it("refuse quand la PR n'a aucune branche à reprendre", async () => {
    h.prLineage = null;

    await expect(relaunch()).resolves.toEqual({ ok: false, error: "prNoBranch" });
    expect(h.created).toHaveLength(0);
  });

  it("refuse quand un run travaille déjà sur cette PR", async () => {
    h.activePr = { id: "autre-run" };

    const result = await relaunch();

    expect(result).toMatchObject({ ok: false, error: "alreadyRunning" });
    expect(h.activeCalls).toEqual(["pr"]);
    expect(h.created).toHaveLength(0);
  });

  it("refuse une PR disparue plutôt que d'ouvrir un run carnet à côté", async () => {
    h.pr = null;

    await expect(relaunch()).resolves.toEqual({ ok: false, error: "prNotFound" });
    expect(h.created).toHaveLength(0);
  });

  it("exige une consigne : sans elle, la session n'a pas de mission", async () => {
    await expect(relaunch({ prompt: "   " })).resolves.toEqual({
      ok: false,
      error: "promptRequired",
    });
  });
});

describe("la lignée du TICKET garde la priorité", () => {
  it("ignore la PR quand un ticket est fourni, et lit sa lignée à lui", async () => {
    h.issueLineage = lineage({ branchName: "minddy/agent/min-249-f80dca09", prNumber: 49 });

    const result = await relaunch({ issueId: ISSUE_ID });

    expect(result.ok).toBe(true);
    expect(h.activeCalls).toEqual(["issue"]);
    expect(h.created[0]).toMatchObject({
      issueId: ISSUE_ID,
      branchName: "minddy/agent/min-249-f80dca09",
      prNumber: 49,
    });
  });
});
