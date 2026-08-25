import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiUsageInput } from "@/lib/server/ai-usage";

/**
 * MIN-223 — the control plane believes NOTHING what the microVM says
 * of herself.
 *
 * What these tests keep is in one sentence: the `runId` comes from the OIDC placed
 * by the platform, never from the body of the request. Everything else — the topic of
 * direct, the payer to the ledger, the actor of ticket entries — DRIFT.
 * Forget it once, on a single surface, and a compromised VM broadcasts on the
 * thread from another run or charge your expense to someone else. It is precisely
 * what a reduced-range Supabase key would not have been able to prevent: the topic and
 * the payer there are parameters.
 *
 * We only mock what comes out of the process (base, realtime, ledger, tools): the
 * Surface routing and branching are the real path.
 */

const h = vi.hoisted(() => ({
  recorded: [] as AiUsageInput[],
  streams: [] as Array<{ topic: string; event: string; text: unknown }>,
  /** The ENTIRE direct load — `streams` only keeps the text. */
  streamPayloads: [] as Array<Record<string, unknown>>,
  events: [] as Array<{ runId: string; type: string }>,
  stamped: [] as Array<Record<string, unknown>>,
  issueCalls: [] as Array<{ ctx: Record<string, unknown>; name: string }>,
  /** What has been entrusted to `afterOrNow` — therefore to the channel which maintains
   * the invocation alive after the response, and never detached. */
  afterWork: [] as Array<() => void | Promise<void>>,
  prIssueId: null as string | null,
  stampReturnsNull: false,
  /** The BASE refuses the write (null byte, failure) — not the transition guard. */
  stampFails: false,
  landed: 0,
  /** Landing contexts passed to the shared implementation. */
  prLandings: [] as Array<{ workBranch: string; baseBranch: string }>,
  run: null as Record<string, unknown> | null,
  /** How many times the run line was BASIC READ. The direct must remain at
   * zero: this is the only hot call from the surface (~4/s during the entire tour). */
  runReads: 0,
  /** What `checkAgentQuota` responds to — `null` = read failed (it throws). */
  quota: null as Record<string, unknown> | null,
  /** The sum of the ledger for this run. */
  ledgerSpent: 0 as number | null,
  /** Runs whose abort flag has been cleared. */
  cleared: [] as string[],
  /** Messages RELEASED by the microVM (`POST /messages`). */
  requeued: [] as Array<{
    runId: string;
    userId: string | null;
    content: string;
    mentions: unknown;
  }>,
  /** Log increments written (`POST /journal`). */
  journal: [] as Array<{ runId: string; sessionId: string; events: unknown[] }>,
  /** Did a THIRD PARTY speak to this run? (the question asked in the notebook, MIN-326) */
  steeredByOther: false,
  /** Tool notebook calls actually EXECUTED. */
  scratchpadCalls: [] as string[],
  /** The token PROFILE requested from `resolveRepoCloneTarget`, call by call. */
  repoAccessAsked: [] as string[],
  forgeRefreshes: [] as Array<{ name: string; token: string }>,
  /** The LLM keys requested from the supplier, with the ceiling placed on each. */
  minted: [] as Array<{ runId: string; capUsd: number }>,
  /** Revoked keys — which must never survive the turn that requested it. */
  revoked: [] as string[],
  /** Sandboxes stopped after their creator loses project access. */
  stopped: [] as string[],
  /** Current project access of the creator, independently of launch-time access. */
  creatorHasAccess: true,
  repoBindingCurrent: true,
  /** Active rows returned to the member-removal lifecycle revoker. */
  revocableRuns: [] as Array<Record<string, unknown>>,
  /** L'API de provisioning refuse (variable absente, panne) : `mintRunKey` → null. */
  mintFails: false,
  byokAvailable: true,
}));

// `runKeyCapUsd` remains the TRUE: it is the arithmetic of the ceiling, and serving it
// from this surface without exercising it would amount to testing nothing at all. Alone
// the two calls that EXIT the process are mocked.
vi.mock("./run-key", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./run-key")>()),
  mintRunKey: vi.fn(async (opts: { runId: string; capUsd: number }) => {
    h.minted.push(opts);
    return h.mintFails
      ? null
      : { key: "sk-or-v1-clef-du-run", hash: "hash-neuf", capUsd: opts.capUsd };
  }),
  revokeRunKey: vi.fn(async (hash: string) => {
    h.revoked.push(hash);
  }),
}));

vi.mock("./model", () => ({
  resolveAgentApiKey: vi.fn(async () =>
    h.byokAvailable
      ? { apiKey: "sk-user-byok", mode: "byok", provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1" }
      : { apiKey: "sk-platform", mode: "platform", provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1" },
  ),
}));

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  recordAiUsage: vi.fn(async (input: AiUsageInput | AiUsageInput[]) => {
    h.recorded.push(...(Array.isArray(input) ? input : [input]));
  }),
  spentFromLedger: vi.fn(async () => h.ledgerSpent),
}));

// The price of the model leaves the process (OpenRouter index): we freeze it, otherwise it
// calculated ceiling would depend on the catalog of the day.
vi.mock("./openrouter-index", () => ({
  getOpenRouterModelInfo: vi.fn(async () => ({
    pricing: { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 },
    cachePricing: null,
  })),
}));

vi.mock("./quota", () => ({
  checkAgentQuota: vi.fn(async () => {
    if (!h.quota) throw new Error("facturation injoignable");
    return h.quota;
  }),
}));

vi.mock("./live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./live")>()),
  broadcastToTopic: vi.fn(
    async (topic: string, event: string, payload: Record<string, unknown>) => {
      h.streams.push({ topic, event, text: payload.text });
      h.streamPayloads.push(payload);
    },
  ),
}));

// `afterOrNow` does NOTHING here: the tests trigger it themselves. This is what
// which makes visible the difference between “entrusted to the background channel” and “detached”
// — a `void fetch(…)` placed before the response would never appear in this
// file, and he would die with the summon in real life.
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (work: () => void | Promise<void>) => {
    h.afterWork.push(work);
  },
}));

vi.mock("./pr-run", () => ({
  loadPrRunContext: vi.fn(async () => ({ issueId: h.prIssueId })),
}));

vi.mock("./vm-rest", () => ({
  landVmTurn: vi.fn(async () => {
    h.landed++;
  }),
}));

vi.mock("./repo-access", () => ({
  resolveRepoCloneTarget: vi.fn(async (_projectId: string, access = "full") => {
    h.repoAccessAsked.push(access);
    return {
      provider: "github",
      repoFullName: "org/repo",
      token: `tok-${access}`,
      remoteUrl: "https://github.com/org/repo.git",
      authUrl: `https://x-access-token:tok-${access}@github.com/org/repo.git`,
      defaultBranch: "main",
      linkId: "link-1",
      connectionId: "connection-1",
      externalRepoId: "9001",
    };
  }),
}));

vi.mock("./sandbox", () => ({
  refreshAgentSandboxForgeAccess: vi.fn(async (name: string, target: { token: string }) => {
    h.forgeRefreshes.push({ name, token: target.token });
  }),
  stopSandboxByName: vi.fn(async (name: string) => {
    h.stopped.push(name);
  }),
}));

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: vi.fn(async () =>
    h.creatorHasAccess ? { isMember: true, isOwner: false, project: {} } : null,
  ),
}));

vi.mock("./forge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./forge")>()),
  forgeFor: vi.fn(() => ({})),
}));

// The FORGED half of `create_pr` is SHARED with the old form, and covered
// with her: here we check what we give her, not what she does with it.
vi.mock("./pr-landing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pr-landing")>()),
  openPullRequestAfterPush: vi.fn(
    async (
      ctx: { workBranch: string; baseBranch: string },
      opts: {
        pushed: { pushed: boolean };
        noteBranchPushed: (p: { pushed: boolean }) => Promise<void>;
      },
    ) => {
      h.prLandings.push({ workBranch: ctx.workBranch, baseBranch: ctx.baseBranch });
      await opts.noteBranchPushed(opts.pushed);
      return { result: { number: 12, url: "https://github.com/org/repo/pull/12" }, success: true };
    },
  ),
}));

vi.mock("./runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runs")>()),
  getRun: vi.fn(async () => {
    h.runReads++;
    return h.run;
  }),
  appendEvent: vi.fn(async (runId: string, type: string) => {
    h.events.push({ runId, type });
  }),
  stampRun: vi.fn(async (_runId: string, fields: Record<string, unknown>) => {
    h.stamped.push(fields);
    return h.stampReturnsNull || h.stampFails ? null : (h.run as never);
  }),
  stampRunResult: vi.fn(async (_runId: string, fields: Record<string, unknown>) => {
    h.stamped.push(fields);
    if (h.stampFails) return { run: null, failed: true };
    return { run: h.stampReturnsNull ? null : (h.run as never), failed: false };
  }),
  pullPendingMessages: vi.fn(async () => [
    { text: "relis @MIN-42", mentions: [{ type: "issue", id: "i-1", label: "MIN-42" }] },
  ]),
  insertRunMessage: vi.fn(
    async (
      runId: string,
      userId: string | null,
      content: string,
      mentions?: unknown[] | null,
    ) => {
      h.requeued.push({ runId, userId, content, mentions: mentions ?? null });
    },
  ),
  appendRunJournal: vi.fn(
    async (runId: string, sessionId: string, events: Record<string, unknown>[]) => {
      h.journal.push({ runId, sessionId, events });
    },
  ),
  runSteeredByOther: vi.fn(async () => h.steeredByOther),
  runRepoBindingIsCurrent: vi.fn(async () => h.repoBindingCurrent),
  readInterruptFlag: vi.fn(async () => true),
  clearInterrupt: vi.fn(async (runId: string) => {
    h.cleared.push(runId);
  }),
}));

vi.mock("./issue-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./issue-tools")>()),
  executeIssueTool: vi.fn(async (ctx: Record<string, unknown>, name: string) => {
    h.issueCalls.push({ ctx, name });
    return { result: { ok: true }, success: true };
  }),
}));

vi.mock("./scratchpad-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./scratchpad-tools")>()),
  executeScratchpadTool: vi.fn(async (_ctx: unknown, name: string) => {
    h.scratchpadCalls.push(name);
    return { result: { ok: true }, success: true };
  }),
}));

vi.mock("@/lib/server/account-settings", () => ({
  getAccountSettings: vi.fn(async () => ({ ok: false as const })),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "agent_runs") {
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: h.revocableRuns, error: null }).then(resolve),
        };
        return query;
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { key: "MIN" } }) }) }),
      };
    },
  }),
}));

import { handleControlPlaneRequest, revokeMemberAgentAuthority } from "./control-plane";
import { CHANGED_FILES_CAP } from "./repo-host";

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_RUN = "99999999-8888-4777-8666-555555555555";

beforeEach(() => {
  h.recorded.length = 0;
  h.streams.length = 0;
  h.streamPayloads.length = 0;
  h.events.length = 0;
  h.stamped.length = 0;
  h.issueCalls.length = 0;
  h.afterWork.length = 0;
  h.requeued.length = 0;
  h.journal.length = 0;
  h.scratchpadCalls.length = 0;
  h.repoAccessAsked.length = 0;
  h.forgeRefreshes.length = 0;
  h.minted.length = 0;
  h.revoked.length = 0;
  h.stopped.length = 0;
  h.creatorHasAccess = true;
  h.repoBindingCurrent = true;
  h.revocableRuns.length = 0;
  h.mintFails = false;
  h.byokAvailable = true;
  h.steeredByOther = false;
  h.prIssueId = null;
  h.stampReturnsNull = false;
  h.stampFails = false;
  h.landed = 0;
  h.prLandings.length = 0;
  h.runReads = 0;
  h.cleared.length = 0;
  h.quota = { unlimited: false, remaining: 3, allowed: true, mode: "platform" };
  h.ledgerSpent = 0;
  h.run = {
    id: RUN_ID,
    status: "running",
    cost_usd: 0,
    budget_usd: null,
    branch_name: null,
    base_branch: "main",
    pr_number: null,
    pr_url: null,
    pr_state: null,
    run_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    project_id: "proj-1",
    repo_link_id: "link-1",
    connection_id: "connection-1",
    repo_provider: "github",
    repo_external_id: "9001",
    issue_id: "issue-1",
    pull_request_id: null,
    created_by: "user-owner",
    chain_id: null,
    model: "deepseek/deepseek-v4-flash",
    checkpoint: { messages: [] },
    // MIN-357: the two columns that `/llm-key` looks at — the key mode (one
    // BYOK cannot be capped) and the key from the previous round, to be revoked.
    key_mode: "platform",
    provider_key_id: null,
  };
});

const call = (
  method: string,
  surface: string,
  body: Record<string, unknown> | null = null,
  runId = RUN_ID,
) => handleControlPlaneRequest({ runId, method, surface, body });

describe("active authority revocation", () => {
  it("proactively revokes active rows during the membership removal lifecycle", async () => {
    h.revocableRuns.push({
      ...h.run!,
      sandbox_id: `agent-${RUN_ID}`,
      provider_key_id: "key-from-active-turn",
    });

    await revokeMemberAgentAuthority({ projectId: "proj-1", userId: "user-owner" });

    expect(h.stamped).toContainEqual({
      status: "canceled",
      interrupt_requested: true,
      error_message: "run owner no longer has project access",
    });
    expect(h.revoked).toEqual(["key-from-active-turn"]);
    expect(h.stopped).toEqual([`agent-${RUN_ID}`]);
  });

  it("stops and de-authorizes a running agent as soon as its creator is removed", async () => {
    expect((await call("POST", "/tool/update_issue", { args: {} })).status).toBe(200);
    expect(h.issueCalls).toHaveLength(1);

    h.creatorHasAccess = false;
    h.run = {
      ...h.run!,
      sandbox_id: `agent-${RUN_ID}`,
      provider_key_id: "key-from-active-turn",
    };

    const denied = await call("POST", "/tool/update_issue", { args: {} });

    expect(denied).toEqual({
      status: 409,
      body: { error: "run owner no longer has project access" },
    });
    expect(h.issueCalls).toHaveLength(1);
    expect(h.stamped).toContainEqual({
      status: "canceled",
      interrupt_requested: true,
      error_message: "run owner no longer has project access",
    });
    expect(h.revoked).toEqual(["key-from-active-turn"]);
    expect(h.stopped).toEqual([`agent-${RUN_ID}`]);
  });

  it("denies repository credential refresh after access is removed", async () => {
    h.creatorHasAccess = false;

    const denied = await call("POST", "/repo-auth");

    expect(denied.status).toBe(409);
    expect(h.repoAccessAsked).toEqual([]);
    expect(h.forgeRefreshes).toEqual([]);
  });

  it("stops live broadcast immediately after membership revocation", async () => {
    h.creatorHasAccess = false;
    expect((await call("POST", "/stream", { text: "stale" })).status).toBe(409);
    expect(h.afterWork).toEqual([]);
    expect(h.streams).toEqual([]);
  });

  it("stops repository operations after the project is rebound", async () => {
    h.repoBindingCurrent = false;
    expect((await call("POST", "/repo-auth")).status).toBe(409);
    expect(h.repoAccessAsked).toEqual([]);
    expect(h.stamped).toContainEqual(
      expect.objectContaining({
        status: "canceled",
        error_message: "run repository binding has changed",
      }),
    );
  });
});

/**
 * MIN-224 — the spending limit for a turn RELEASES midway through.
 *
 * A round of microVM lasts hours and its ceiling was frozen when launched.
 * But nothing reserves budget: two runs launched at the same second read the same
 * remaining and each take it as their ceiling, so they can spend double.
 */
describe("le budget restant du tour", () => {
  it("rend le restant du COMPTE quand le run n'a pas de plafond propre", async () => {
    // The common case: only routines set a `budget_usd`.
    const res = await call("GET", "/budget");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ remainingUsd: 3 });
  });

  it("prend le plus serré des deux, et déduit au LEDGER ce que le run a dépensé", async () => {
    // A $2 routine, which has already burned $1.20 — part of which is just a dead chunk
    // was never stamped on the column. It is the ledger who carries it.
    h.run = { ...h.run!, budget_usd: 2, cost_usd: 0.4 };
    h.ledgerSpent = 1.2;
    const res = await call("GET", "/budget");
    expect((res.body as { remainingUsd: number }).remainingUsd).toBeCloseTo(0.8, 6);
  });

  it("laisse le compte gagner quand c'est lui qui borne", async () => {
    h.run = { ...h.run!, budget_usd: 10 };
    h.quota = { unlimited: false, remaining: 0.5, allowed: true, mode: "platform" };
    expect(await call("GET", "/budget").then((r) => r.body)).toEqual({ remainingUsd: 0.5 });
  });

  it("rend `null` pour un BYOK cloud sans plafond de run", async () => {
    h.quota = { unlimited: true, allowed: true, mode: "byok" };
    expect(await call("GET", "/budget").then((r) => r.body)).toEqual({ remainingUsd: null });
  });

  it("rend `null` quand la facturation est injoignable, jamais 0", async () => {
    // A 0 would stop the round on a read failure. The VM then keeps its
    // input ceiling: worst case is the behavior before, not worse.
    h.quota = null;
    const res = await call("GET", "/budget");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ remainingUsd: null });
  });
});

describe("le direct — le topic vient du run, pas du corps", () => {
  it("diffuse sur le run de l'OIDC même quand le corps en désigne un autre", async () => {
    const res = await call("POST", "/stream", { text: "salut", runId: OTHER_RUN, topic: "x" });
    expect(res.status).toBe(200);
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streams).toEqual([{ topic: `agent-run:${RUN_ID}`, event: "stream", text: "salut" }]);
  });

  it("confie la diffusion au canal de fond, au lieu de la détacher", async () => {
    // Direct is not written ANYWHERE: unlike events, no poll
    // catches up with him. Detached just before the response, its fetch dies frozen with
    // the invocation and the thread never sees the agent writing (cf. after-safe.ts).
    await call("POST", "/stream", { text: "salut" });
    // Nothing happened during the request: the broadcast is waiting for the hook.
    expect(h.streams).toHaveLength(0);
    expect(h.afterWork).toHaveLength(1);
    // And work must RENDER its promise: detach it from within the
    // hook would do exactly the same breakdown, one notch lower.
    const returned = h.afterWork[0]();
    expect(returned).toBeInstanceOf(Promise);
    await returned;
    expect(h.streams).toHaveLength(1);
  });

  it("revalidates the run before every live broadcast", async () => {
    await call("POST", "/stream", { text: "salut" });
    expect(h.runReads).toBe(1);
    await call("POST", "/events", { type: "status" });
    expect(h.runReads).toBe(2);
  });

  it("does not broadcast after the run row disappears", async () => {
    h.run = null;
    expect((await call("POST", "/stream", { text: "salut" })).status).toBe(404);
    expect(h.afterWork).toEqual([]);
  });

  it("ne rediffuse pas la liste de fichiers telle quelle : chemins vides, statuts inventés et surplus tombent", async () => {
    // The VM is our code, but it remains on the other side of a POST: which
    // share on the topic is what the thread can read, not what she sent.
    await call("POST", "/stream", {
      text: "",
      files: [
        { path: "a.ts", status: "deleted" },
        { path: "b.ts", status: "cosmique" }, // statut inconnu → modified
        { path: "", status: "added" }, // empty path → ignored
        "pas un objet",
        { path: "c.ts", status: "renamed", previousPath: "old.ts", vole: "des octets" },
      ],
    });
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streamPayloads[0].files).toEqual([
      { path: "a.ts", status: "deleted" },
      { path: "b.ts", status: "modified" },
      { path: "c.ts", status: "renamed", previousPath: "old.ts" },
    ]);
    // Two entries discarded: the list broadcast is shorter than the one received.
    expect(h.streamPayloads[0].filesTruncated).toBe(true);
  });

  it("borne la liste, et le DIT", async () => {
    // Without a cap, a round that affects 500 files broadcasts them all, four times
    // per second, to all subscribers of the topic.
    await call("POST", "/stream", {
      text: "",
      files: Array.from({ length: CHANGED_FILES_CAP + 20 }, (_, i) => ({
        path: `f${i}.ts`,
        status: "modified",
      })),
    });
    await Promise.all(h.afterWork.map((w) => w()));
    expect((h.streamPayloads[0].files as unknown[]).length).toBe(CHANGED_FILES_CAP);
    expect(h.streamPayloads[0].filesTruncated).toBe(true);
  });

  it("garde l'aveu de troncature de la VM, qui borne DÉJÀ avant d'envoyer", async () => {
    // The VM cuts at the same ceiling: its list therefore arrives complete from the point of view
    // of the relay (`raw.length === files.length`), and without this report the truncation
    // got lost here — the thread read a limited list as a complete list.
    await call("POST", "/stream", {
      text: "",
      files: [{ path: "a.ts", status: "modified" }],
      filesTruncated: true,
    });
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streamPayloads[0].filesTruncated).toBe(true);
  });

  it("relaie les compteurs Git locaux, nettoyés comme le reste du direct", async () => {
    await call("POST", "/stream", {
      text: "",
      fileStats: [
        { path: "lib/a.ts", status: "modified", additions: 8.6, deletions: -4 },
        { path: "", additions: 20, deletions: 1 },
      ],
    });
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streamPayloads[0].fileStats).toEqual([
      { path: "lib/a.ts", status: "modified", additions: 9, deletions: 0 },
    ]);
  });

  it("ne parle pas de fichiers quand il n'y en a pas", async () => {
    // `clearLive` goes through here: an empty list must not become a `files: []`
    // that the thread would read as "the trick didn't hit anything".
    await call("POST", "/stream", { text: "salut" });
    await Promise.all(h.afterWork.map((w) => w()));
    expect(h.streamPayloads[0]).not.toHaveProperty("files");
    expect(h.streamPayloads[0]).not.toHaveProperty("filesTruncated");
  });
});

describe("le ledger — le payeur vient de la ligne du run, pas du corps", () => {
  it("impute au créateur du run et ignore un billTo envoyé", async () => {
    await call("POST", "/usage", {
      feature: "agent_code",
      cost: 0.42,
      // The tokens accompany the amount, as on any real line of
      // supplier: above the floor, this is what makes the amount
      // verifiable (MIN-329).
      promptTokens: 1_000_000,
      completionTokens: 100_000,
      billTo: { userId: "quelquun-dautre" },
      userId: "quelquun-dautre",
      runId: OTHER_RUN,
    });
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0].billTo).toEqual({ userId: "user-owner" });
    // …and under the billing ID of the run, not under that of the body.
    expect(h.recorded[0].runId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(h.recorded[0].cost).toBe(0.42);
  });

  /**
   * MIN-329 — amount is not a declaration.
   *
   * The body of `/usage` comes from a loop driven by a model that reads
   * third-party content: one injection was enough to post a negative `cost`, and
   * this line brought down the consumption of the month in the account.
   */
  it("REFUSE un cost négatif, et n'écrit AUCUNE ligne", async () => {
    const res = await call("POST", "/usage", { feature: "agent_code", cost: -500 });
    expect(res.status).toBe(400);
    expect(h.recorded).toHaveLength(0);
    // The refusal is traced on the run: an expense which does not enter anywhere must be
    // read where the hole was made.
    expect(h.events).toEqual([{ runId: RUN_ID, type: "error" }]);
  });

  it("refuse un montant impossible ou démesuré", async () => {
    for (const cost of [Number.NaN, Number.POSITIVE_INFINITY, 10_000]) {
      expect((await call("POST", "/usage", { feature: "agent_code", cost })).status).toBe(400);
    }
    expect(h.recorded).toHaveLength(0);
  });

  it("refuse un compteur de tokens négatif", async () => {
    const res = await call("POST", "/usage", {
      feature: "agent_code",
      cost: 0.01,
      promptTokens: -1_000,
    });
    expect(res.status).toBe(400);
    expect(h.recorded).toHaveLength(0);
  });

  it("écrit NOTRE montant quand les tokens ne peuvent pas justifier le sien", async () => {
    const res = await call("POST", "/usage", {
      feature: "agent_code",
      cost: 40,
      promptTokens: 100_000,
      completionTokens: 10_000,
    });
    expect(res.status).toBe(200);
    // 100k × $0.30 + 10k × $1.20 per million = $0.042, and the line reads
    // calculated: this figure was not recorded by the supplier.
    expect(h.recorded[0].cost).toBe(0.042);
    expect(h.recorded[0].estimated).toBe(true);
  });

  it("le total d'un compte ne peut donc que MONTER après un tour", async () => {
    // The sum of the ledger is done on `cost`: it is enough that no line is written
    // is negative so that it never comes back down.
    for (const cost of [-1, -0.000001, Number.NaN, 1e9, 0.02]) {
      await call("POST", "/usage", { feature: "agent_code", cost, completionTokens: 100_000 });
    }
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded.every((line) => (line.cost ?? 0) >= 0)).toBe(true);
  });

  it("range la ligne dans SA bande de seq, quel que soit l'index envoyé", async () => {
    await call("POST", "/usage", { feature: "agent_code", cost: 0.01, seq: -42 });
    expect(h.recorded[0].seq).toBe(0);
  });

  it("refuse une feature hors du périmètre de l'agent", async () => {
    // Without this refusal, a compromised VM would place its expense under `numo_chat` and
    // would take it out of the agent's counters — invisible where we look for it.
    const res = await call("POST", "/usage", { feature: "numo_chat", cost: 10 });
    expect(res.status).toBe(400);
    expect(h.recorded).toHaveLength(0);
  });
});

describe("les events", () => {
  it("écrivent sur le run de l'OIDC", async () => {
    await call("POST", "/events", { type: "tool_call", payload: { name: "read_file" } });
    expect(h.events).toEqual([{ runId: RUN_ID, type: "tool_call" }]);
  });

  it("refusent un event sans type plutôt que d'en inventer un", async () => {
    expect((await call("POST", "/events", { payload: {} })).status).toBe(400);
  });
});

describe("le checkpoint", () => {
  it("rend celui de la ligne", async () => {
    const res = await call("GET", "/checkpoint");
    expect(res.body).toEqual({ checkpoint: { messages: [] } });
  });

  it("dit 409 quand le run n'est plus en cours — au lieu de laisser croire", async () => {
    // A VM that believes it has saved and continues working for a
    // conversation which is over.
    h.stampReturnsNull = true;
    const res = await call("PUT", "/checkpoint", { checkpoint: { messages: [1] } });
    expect(res.status).toBe(409);
  });
});

describe("steering et interruption — inchangés côté base", () => {
  it("drainent les messages en attente, MENTIONS COMPRISES", async () => {
    // The form changed with the mentions (PR 52): a message is an object, and
    // its ids travel alongside its text — that's what the supervisor
    // will repost to the model without making him guess them.
    expect((await call("GET", "/messages")).body).toEqual({
      messages: [{ text: "relis @MIN-42", mentions: [{ type: "issue", id: "i-1", label: "MIN-42" }] }],
    });
  });

  it("rendent le drapeau d'interruption", async () => {
    expect((await call("GET", "/interrupt")).body).toEqual({ interrupted: true });
  });

  /**
   * MIN-286 — the counterpart of drainage. The opencode supervisor consumes the queue
   * BEFORE cutting the round to restart behind: when the round comes out between the
   * two (ceiling, deadline, run concluded elsewhere), the message was neither played nor
   * kept, and it dies with the microVM. So he comes back in line, and it's HE who
   * re-queue the run.
   */
  it("REMETTENT en file ce qui a été drainé sans être joué", async () => {
    const res = await call("POST", "/messages", { messages: ["fais plutôt ça", "  ", ""] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requeued: 1 });
    // Without author: reinserted, it becomes an ordinary waiting message again.
    expect(h.requeued).toEqual([
      // `parseAgentMentions` returns an EMPTY list when there is nothing to read —
      // `insertRunMessage` then does not write the column.
      { runId: RUN_ID, userId: null, content: "fais plutôt ça", mentions: [] },
    ]);
  });

  /**
   * PR 52 — UN MESSAGE REMIS EN FILE GARDE SES MENTIONS.
   *
   * Returning to the queue is the only thing that separates "accepted on screen" from
   * “played” when a trick comes out at the wrong time. If he lost the ids in
   * path, the next round would reread “reread @MIN-42” without knowing which
   * ticket we're talking about — which is exactly what this PR fixes.
   */
  it("gardent les mentions d'un message remis en file, et ignorent une forme illisible", async () => {
    const res = await call("POST", "/messages", {
      messages: [
        { text: "relis @MIN-42", mentions: [{ type: "issue", id: "i-1", label: "MIN-42" }] },
        { text: "   " },
        { mentions: [] },
        42,
      ],
    });
    expect(res.body).toEqual({ requeued: 1 });
    expect(h.requeued).toEqual([
      {
        runId: RUN_ID,
        userId: null,
        content: "relis @MIN-42",
        mentions: [{ type: "issue", id: "i-1", label: "MIN-42" }],
      },
    ]);
  });

  /**
   * MIN-329 — re-queuing is limited like the writing that produced it.
   * Without a limit, the surface wrote as many messages in base as the VM in base
   * sent, of the size she wanted - and everyone came back promptly
   * tour suivant.
   */
  it("bornent le nombre et la taille de ce qui revient en file", async () => {
    const res = await call("POST", "/messages", {
      messages: Array.from({ length: 80 }, () => "x".repeat(9_000)),
    });
    expect(res.body).toEqual({ requeued: 50 });
    expect(h.requeued).toHaveLength(50);
    expect(h.requeued.every((m) => m.content.length === 4_000)).toBe(true);
  });

  it("l'EFFACENT sur DELETE — et seulement pour LEUR run", async () => {
    // The loop consumes the flag when the “stop” it has just read
    // arrived with a message: the tour then continues with the instruction to
    // instead of going out to be re-queued by this message left in queue. The runId
    // comes from the OIDC claim, never from the body: a VM can only delete its own.
    expect((await call("DELETE", "/interrupt")).status).toBe(200);
    expect(h.cleared).toEqual([RUN_ID]);
  });
});

describe("les tools de plateforme", () => {
  it("rejouent un tool ticket avec l'acteur du run, jamais celui du corps", async () => {
    await call("POST", "/tool/read_issue", {
      args: { issue: "MIN-1" },
      actorId: "quelquun-dautre",
    });
    expect(h.issueCalls).toHaveLength(1);
    expect(h.issueCalls[0].ctx.actorId).toBe("user-owner");
    expect(h.issueCalls[0].ctx.runId).toBe(RUN_ID);
  });

  it("ancrent une RELECTURE sur le ticket de sa pull request", async () => {
    // `run.issue_id` is always zero on a review session, but the PR carries
    // often the ticket that it implements: HE is the fault of `read_issue`
    // (same rule as execute.ts). Without that, the tool announces a fault that does not exist
    // not, and the first call without argument burns a round.
    h.run = { ...h.run, issue_id: null, pull_request_id: "pr-1" };
    h.prIssueId = "issue-de-la-pr";
    await call("POST", "/tool/read_issue", { args: {} });
    expect(h.issueCalls[0].ctx.anchorIssueId).toBe("issue-de-la-pr");
  });

  it("ouvrent la pull request sur la branche que la VM vient de POUSSER", async () => {
    // `agent_runs.branch_name` is only stamped after a first REAL push
    // (MIN-123) — but it is `create_pr` who has just done it. Read it on the line
    // of the run gave an EMPTY head to the forge, and stamped `branch_name: ""`.
    const branch = `minddy/agent/agent-${RUN_ID.slice(0, 8)}`;
    const res = await call("POST", "/tool/create_pr", {
      args: { title: "Ajoute le truc" },
      pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
      workBranch: branch,
    });
    expect(res.status).toBe(200);
    expect(h.prLandings).toEqual([{ workBranch: branch, baseBranch: "main" }]);
    // …and it is THIS branch that we record on the run line.
    expect(h.stamped.find((f) => "branch_name" in f)).toMatchObject({ branch_name: branch });
  });

  it("retombent sur la branche de la ligne quand la VM n'en envoie pas", async () => {
    h.run = { ...h.run, branch_name: "minddy/agent/deja-poussee" };
    await call("POST", "/tool/create_pr", {
      args: { title: "Suite" },
      pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
    });
    expect(h.prLandings[0].workBranch).toBe("minddy/agent/deja-poussee");
    // Already recorded: we do not re-stamp it.
    expect(h.stamped.some((f) => "branch_name" in f)).toBe(false);
  });

  it("refusent un `create_pr` sans résultat de push — la VM seule sait si elle a poussé", async () => {
    expect((await call("POST", "/tool/create_pr", { args: { title: "x" } })).status).toBe(400);
    expect(h.prLandings).toHaveLength(0);
  });

  it("rejects a sandbox branch that is not the run's generated branch", async () => {
    const res = await call("POST", "/tool/create_pr", {
      args: { title: "x" },
      pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
      workBranch: "refs/heads/main:stolen",
    });
    expect(res.status).toBe(400);
    expect(h.prLandings).toEqual([]);
  });

  it("ne servent PAS les tools de fichier — ils s'exécutent dans la VM", async () => {
    // 403 and not 404: the name is not in the game of this run, which is not the
    // same thing as “it doesn’t exist” (MIN-326).
    for (const name of ["read_file", "edit_file", "run_command", "git_commit"]) {
      expect((await call("POST", `/tool/${name}`, { args: {} })).status).toBe(403);
    }
  });
});

/**
 * MIN-326 — ANCHOR IS A CODE LOCK, NOT A PROMPT SENTENCE.
 *
 * `runPlatformTool` routed only to the NAME of the tool. A proofreading session —
 * the one that the entire repository claims is read-only, and the only one that
 * the content read comes from an unknown fork — could therefore write in tickets,
 * the notebook, the wiki and even in a planned ROUTINE, by a POST on
 * `/api/agent-vm/tool/<nom>` from its shell. An instruction slipped into a
 * `AGENTS.md` suffisait.
 */
describe("l'ancrage du run ferme la surface `/tool/`", () => {
  /** A review session: `issue_id` null, an anchored pull request. */
  const review = () => {
    h.run = { ...h.run, issue_id: null, pull_request_id: "pr-1" };
  };

  it("refuse à une RELECTURE toute écriture minddy, et n'écrit RIEN", async () => {
    review();
    for (const name of [
      "create_issue",
      "update_issue",
      "write_issue_plan",
      "create_page",
      "create_objective",
      "create_routine",
      "set_scratchpad",
      "read_scratchpad",
      "create_pr",
    ]) {
      const res = await call("POST", `/tool/${name}`, {
        args: { title: "x" },
        pushed: { pushed: true, remoteUpdated: true, headSha: "abc" },
      });
      expect(res.status, name).toBe(403);
    }
    expect(h.issueCalls).toEqual([]);
    expect(h.scratchpadCalls).toEqual([]);
    expect(h.prLandings).toEqual([]);
  });

  it("laisse à la relecture ses LECTEURS et les écritures de sa pull request", async () => {
    review();
    expect((await call("POST", "/tool/read_issue", { args: {} })).status).toBe(200);
    expect((await call("POST", "/tool/read_page", { args: { page: "p" } })).status).toBe(200);
    // `comment_pr` leaves for the forge: what matters here is that he is not refused
    // upstream — execution is covered by `pr-tools.test.ts`.
    expect((await call("POST", "/tool/comment_pr", { args: { body: "ok" } })).status).not.toBe(403);
  });

  it("refuse les pull requests DU PROJET à une relecture — elle n'a que la sienne", async () => {
    review();
    for (const name of ["list_pull_requests", "review_pull_request", "set_pull_request_state"]) {
      expect((await call("POST", `/tool/${name}`, { args: { pull_request: 3 } })).status, name).toBe(
        403,
      );
    }
  });

  it("ne retire rien à un run de TICKET — c'est le risque de régression", async () => {
    for (const name of ["create_issue", "update_issue", "create_routine", "create_page"]) {
      expect((await call("POST", `/tool/${name}`, { args: {} })).status, name).toBe(200);
    }
    expect((await call("POST", "/tool/set_scratchpad", { args: { content: "x" } })).status).toBe(200);
    expect(h.scratchpadCalls).toEqual(["set_scratchpad"]);
  });
});

/**
 * MIN-421 — `/repo-auth` refreshes trusted infrastructure and returns no
 * credential. Reviews remain unable to rotate the transport to write access.
 */
describe("forge authentication refresh", () => {
  it("refuses every refresh from a review session", async () => {
    h.run = { ...h.run, issue_id: null, pull_request_id: "pr-1" };
    const res = await call("POST", "/repo-auth");
    expect(res.status).toBe(403);
    // Nothing is minted when authorization fails.
    expect(h.repoAccessAsked).toEqual([]);
  });

  it("rotates a repository-scoped token without returning it to an issue run", async () => {
    const res = await call("POST", "/repo-auth");
    expect(res.status).toBe(200);
    expect(h.repoAccessAsked).toEqual(["repo-write"]);
    expect(h.forgeRefreshes).toEqual([
      { name: `agent-${RUN_ID}`, token: "tok-repo-write" },
    ]);
    expect(res.body).toEqual({ refreshed: true });
    expect(JSON.stringify(res.body)).not.toContain("tok-repo-write");
  });

  it("rotates the same scoped credential for a notebook run", async () => {
    h.run = { ...h.run, issue_id: null, pull_request_id: null };
    expect((await call("POST", "/repo-auth")).status).toBe(200);
    expect(h.repoAccessAsked).toEqual(["repo-write"]);
  });
});

/**
 * MIN-326 — THE NOTEBOOK IS PERSONAL, AND IT IS THAT OF THE CREATOR OF THE RUN.
 *
 * Any member of the project can resume a hot run (`/steer`):
 * tools notebook are wired to `run.created_by`. A colleague was piloting
 * an agent tapped into someone else's private note — which he could read,
 * and rewrite in full.
 */
describe("le carnet se ferme dès qu'un tiers a parlé au run", () => {
  it("refuse les tools carnet sur un run repris par quelqu'un d'autre", async () => {
    h.steeredByOther = true;
    for (const name of [
      "read_scratchpad",
      "set_scratchpad",
      "add_scratchpad_tasks",
      "update_scratchpad_task",
    ]) {
      expect((await call("POST", `/tool/${name}`, { args: {} })).status, name).toBe(403);
    }
    expect(h.scratchpadCalls).toEqual([]);
  });

  it("laisse les tools TICKET ouverts sur ce même run — l'acteur y est le lanceur, pas une note privée", async () => {
    h.steeredByOther = true;
    expect((await call("POST", "/tool/update_issue", { args: {} })).status).toBe(200);
  });

  it("rejects a run with no authority-bearing owner", async () => {
    h.run = { ...h.run, created_by: null };
    expect((await call("POST", "/tool/read_scratchpad", { args: {} })).status).toBe(409);
    expect(h.scratchpadCalls).toEqual([]);
  });
});

describe("la surface est fermée", () => {
  it("refuse ce qu'elle ne connaît pas", async () => {
    expect((await call("POST", "/whatever")).status).toBe(404);
    // …including a good surface with the wrong method.
    expect((await call("GET", "/events")).status).toBe(404);
    expect((await call("POST", "/messages/pending")).status).toBe(404);
  });

  it("refuse un run qui n'existe pas", async () => {
    h.run = null;
    expect((await call("POST", "/events", { type: "status" })).status).toBe(404);
  });
});

describe("la fin de tour n'atterrit qu'UNE fois", () => {
  it("met la session au repos quand le run tourne encore", async () => {
    const res = await call("POST", "/rest", { status: "completed", costUsd: 0.1 });
    expect(res.status).toBe(200);
    expect(h.landed).toBe(1);
  });

  it("refuse en 409 un second rapport — le client ne le retente pas", async () => {
    // The control plane client tries again on 5xx: without this guard, a report
    // whose response was lost in flight would be replayed. Duplicate events in the
    // thread, and a SECOND compute line to the ledger — the microVM half of the
    // invoice, counted twice.
    h.run = { ...h.run, status: "completed" };
    const res = await call("POST", "/rest", { status: "completed", costUsd: 0.1 });
    expect(res.status).toBe(409);
    expect(h.landed).toBe(0);
  });

  it("refuse un rapport sans statut plutôt que d'en inventer un", async () => {
    expect((await call("POST", "/rest", { costUsd: 1 })).status).toBe(400);
    expect(h.landed).toBe(0);
  });
});

describe("le checkpoint périodique fait aussi office de battement de cœur", () => {
  it("horodate l'activité du run à chaque sauvegarde", async () => {
    // This is the only regular signal that a rook that lives in the VM produces, and
    // it is on him that the watchdog decides to question the platform.
    // Without it, it would probe it for each run each time the cron passes.
    await call("PUT", "/checkpoint", { checkpoint: { messages: [] } });
    expect(h.stamped[0]).toHaveProperty("last_activity_at");
  });

  it("dit 409 quand le run n'est plus en cours — la VM doit s'arrêter", async () => {
    h.stampReturnsNull = true;
    const res = await call("PUT", "/checkpoint", { checkpoint: { messages: [] } });
    expect(res.status).toBe(409);
  });

  /**
   * MIN-286 — A WRITE FAILURE IS NOT A CONCLUDED RUN.
   *
   * The supervisor reads a 409 as “the conversation no longer exists”: he cuts
   * the turn, he doesn't push, he gives back. A base that refuses the line —
   * the null byte of 2026-08-12, a network outage — therefore told him to give up
   * a perfectly lively turn, and the thread remained frozen on its last gesture.
   */
  it("dit 503 quand la BASE refuse — la VM doit retenter, pas mourir", async () => {
    h.stampFails = true;
    const res = await call("PUT", "/checkpoint", { checkpoint: { messages: [] } });
    expect(res.status).toBe(503);
  });
});

/**
 * MIN-286 (2026-08-13) — THE OPENCODE LOG IS WRITTEN IN APPEND.
 *
 * He carried the full output of each tool and traveled through the checkpoint:
 * the ceiling of the body fell after about fifteen file readings, and
 * a 31 minute round lost all his conversation. The microVM no longer sends
 * only what is NEW, and the run line — reread at each call of this
 * surface — only keeps the pointer.
 */
describe("le journal de la session", () => {
  it("écrit l'incrément sous le run de l'OIDC, pas sous celui du corps", async () => {
    const res = await call("POST", "/journal", {
      runId: "un-autre-run",
      sessionId: "ses_1",
      events: [{ seq: 1 }, { seq: 2 }],
    });
    expect(res.status).toBe(200);
    expect(h.journal).toEqual([
      { runId: RUN_ID, sessionId: "ses_1", events: [{ seq: 1 }, { seq: 2 }] },
    ]);
  });

  it("refuse un lot sans session — il n'y aurait rien à rejouer", async () => {
    const res = await call("POST", "/journal", { events: [{ seq: 1 }] });
    expect(res.status).toBe(400);
    expect(h.journal).toEqual([]);
  });
});

/**
 * MIN-331 — A MICROVM ONLY SPEAKS FOR ITS RUN, seen from the base.
 *
 * The route admission (`admitSandboxCaller`) already denies a sandbox of a
 * other Vercel account, and derives the run from the signed name — therefore the name and the run
 * agree by construction. This control is the other half: the line of
 * run should RECOGNIZE this microVM as its own. The day the naming
 * would cease to be deterministic, that's where it says it, not in the logs.
 */
describe("la microVM appelante et le run qu'elle prétend exécuter", () => {
  it("laisse passer la microVM enregistrée sur le run", async () => {
    h.run = { ...h.run!, sandbox_id: `agent-${RUN_ID}` };
    const res = await handleControlPlaneRequest({
      runId: RUN_ID,
      method: "POST",
      surface: "/events",
      body: { type: "assistant_message" },
      sandboxName: `agent-${RUN_ID}`,
    });
    expect(res.status).toBe(200);
    expect(h.events).toHaveLength(1);
  });

  it("refuse la microVM d'un AUTRE run, et n'écrit rien", async () => {
    h.run = { ...h.run!, sandbox_id: `agent-${RUN_ID}` };
    const res = await handleControlPlaneRequest({
      runId: RUN_ID,
      method: "POST",
      surface: "/events",
      body: { type: "assistant_message" },
      sandboxName: "agent-99999999-8888-4777-8666-555555555555",
    });
    expect(res.status).toBe(403);
    expect(h.events).toEqual([]);
  });

  it("laisse passer un run dont la microVM n'est pas encore enregistrée", async () => {
    h.run = { ...h.run!, sandbox_id: null };
    const res = await handleControlPlaneRequest({
      runId: RUN_ID,
      method: "POST",
      surface: "/events",
      body: { type: "assistant_message" },
      sandboxName: `agent-${RUN_ID}`,
    });
    expect(res.status).toBe(200);
  });
});

/**
 * MIN-355 — THE LOCAL ROAD, AND WHAT IT’S NOT USEFUL.
 *
 * A spin that plays on the user's machine carries a token that WE have
 * signed, on a disk that the model can read. We therefore do not claim the
 * protect: we reduce what it opens. Three refusals, and a keep of freshness which
 * costs nothing because the run line is already read.
 */
describe("le plan de contrôle vu depuis une machine", () => {
  const LOCAL_GEN = 4;
  const callLocal = (
    method: string,
    surface: string,
    body: Record<string, unknown> | null = null,
    gen = LOCAL_GEN,
  ) =>
    handleControlPlaneRequest({ runId: RUN_ID, method, surface, body, local: { gen } });

  beforeEach(() => {
    h.run = { ...h.run!, local_exec: true, local_exec_gen: LOCAL_GEN };
  });

  it("sert les surfaces ordinaires d'un run local qui travaille", async () => {
    expect((await callLocal("POST", "/events", { type: "assistant_message" })).status).toBe(200);
    expect(h.events).toHaveLength(1);
  });

  it("diffuse le patch local sur un message séparé et borné", async () => {
    const res = await callLocal("POST", "/diff", {
      files: [
        { filename: "lib/a.ts", status: "modified", additions: 4.7, deletions: -2, patch: "@@\n+x" },
        { filename: "", patch: "ignoré" },
      ],
    });
    expect(res.status).toBe(200);
    expect(h.afterWork).toHaveLength(1);
    await h.afterWork[0]();
    expect(h.streams[0]).toMatchObject({ topic: `agent-run:${RUN_ID}`, event: "diff" });
    expect(h.streamPayloads[0]).toMatchObject({
      files: [{ filename: "lib/a.ts", status: "modified", additions: 5, deletions: 0, patch: "@@\n+x" }],
      truncated: false,
    });
  });

  it("refuse la surface de diff local à une microVM cloud", async () => {
    expect((await call("POST", "/diff", { files: [] })).status).toBe(403);
  });

  it("refuse un jeton dont la GÉNÉRATION a été dépassée — la révocation est là", async () => {
    // Issuing a token increments the generation (`issueLocalExecToken`): that of
    // the previous machine dies instantly, without us having anything to remember.
    const res = await callLocal("POST", "/events", { type: "assistant_message" }, LOCAL_GEN - 1);
    expect(res.status).toBe(403);
    expect(h.events).toEqual([]);
  });

  it("refuse un jeton signé pour un run qui n'est PAS local", async () => {
    // Shouldn't exist — so if it exists, it's our fault, and
    // it stops here rather than opening a second route on a cloud run.
    h.run = { ...h.run!, local_exec: false };
    expect((await callLocal("POST", "/events", { type: "assistant_message" })).status).toBe(403);
    expect(h.events).toEqual([]);
  });

  it("exige que le run TRAVAILLE, sur toutes les surfaces qui lisent sa ligne", async () => {
    // A microVM gets shut down while idle; a machine, no. Without this line, a
    // fifteen minute token would still serve as the tools of a finished conversation
    // and would consume its steering line.
    h.run = { ...h.run!, status: "completed" };
    for (const [method, surface] of [
      ["POST", "/events"],
      ["GET", "/messages"],
      ["POST", "/tool/read_issue"],
      ["GET", "/budget"],
      ["POST", "/llm-key"],
    ] as const) {
      const res = await callLocal(method, surface, { type: "assistant_message", args: {} });
      // 409 and not 403: this is the one that the control plan client already reads
      // like "stop", and it is not tried again.
      expect([surface, res.status]).toEqual([surface, 409]);
    }
    expect(h.events).toEqual([]);
    expect(h.issueCalls).toEqual([]);
  });

  it("ne rend AUCUN token de forge — le renouvellement passe par l'app", async () => {
    const res = await callLocal("POST", "/repo-auth");
    expect(res.status).toBe(403);
    // Nothing has been minted: the refusal is upstream of the forge.
    expect(h.repoAccessAsked).toEqual([]);
  });

  /**
   * MIN-357 — THE KEY TO THE MODEL, AND THE MIRROR OF `/repo-auth`.
   *
   * On a Mac there is no firewall to place the key on exit: it
   * goes down to the harness proxy, in memory, and this surface is where.
   * The platform key is only returned if it has been minted with a hard cap.
   * The BYOK key is served directly for local launches that the
   * Admission surface reserved for interactive user action.
   */
  describe("la clé du modèle", () => {
    it("mint une clé plafonnée sur le restant du compte, et la stampe pour la révoquer", async () => {
      const res = await callLocal("POST", "/llm-key");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: "sk-or-v1-clef-du-run", capUsd: 3 });
      // The ceiling is not declared by the machine: it is calculated here, on the
      // account quota and ledger, exactly as when launching a chunk.
      expect(h.minted).toEqual([{ runId: RUN_ID, capUsd: 3 }]);
      // Without this stamp, neither the end of the turn nor the guard dog would know what
      // revoke: the key would live its 24 hours on someone's machine.
      expect(h.stamped.at(-1)).toEqual({ provider_key_id: "hash-neuf" });
    });

    it("révoque la clé du tour précédent", async () => {
      h.run = { ...h.run!, provider_key_id: "hash-du-tour-davant" };
      await callLocal("POST", "/llm-key");
      expect(h.revoked).toEqual(["hash-du-tour-davant"]);
    });

    it("n'en sert AUCUNE à une microVM", async () => {
      // There, the key is placed by the firewall AFTER the exit of the VM: the
      // serve would bring the secret into the process where the model has a shell,
      // that is to say, undo MIN-223 through a door that has been opened.
      expect((await call("POST", "/llm-key")).status).toBe(403);
      expect(h.minted).toEqual([]);
    });

    it("sert directement la clé BYOK sans plafond ni mint", async () => {
      h.run = { ...h.run!, key_mode: "byok", budget_usd: null };
      const res = await callLocal("POST", "/llm-key");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: "sk-user-byok" });
      expect(h.minted).toEqual([]);
      expect(h.stamped).toEqual([]);
    });

    it("refuse un BYOK dont la clé a été retirée", async () => {
      h.run = { ...h.run!, key_mode: "byok", budget_usd: null };
      h.byokAvailable = false;
      expect((await callLocal("POST", "/llm-key")).status).toBe(409);
      expect(h.minted).toEqual([]);
    });

    it("rend 503 quand rien ne sait minter — jamais la clé plateforme", async () => {
      // This is THE point of the lock: the platform key is uncapped and shared
      // with Numo, transcription, embeddings and catalog. A local tour
      // which does not have a capped key should not take place.
      h.mintFails = true;
      const res = await callLocal("POST", "/llm-key");
      expect(res.status).toBe(503);
      // And nothing is stamped: we do not replace a revocable hash with nothing.
      expect(h.stamped).toEqual([]);
      expect(h.revoked).toEqual([]);
    });
  });

  it("sert le MÊME jeu de tools que dans la microVM, carnet compris", async () => {
    /**
     * The framework wanted to remove `set_scratchpad` from the local path — the only tool
     * destructive of the surface. Dismissed on 2026-08-15, and this test is the trace of
     * the decision rather than its absence:
     *
     * - a token holder reads the book and its `rev` by `read_scratchpad`, which
     * remains served: compare-and-swap only keeps obsolescence;
     * - and a refusal served here without withdrawal from the CATALOG (`agentToolsFor`) would
     * burn a round on the model on a declared tool that lies.
     */
    for (const name of [
      "read_scratchpad",
      "add_scratchpad_tasks",
      "update_scratchpad_task",
      "set_scratchpad",
    ]) {
      expect([name, (await callLocal("POST", `/tool/${name}`, { args: {} })).status]).toEqual([
        name,
        200,
      ]);
    }
    expect(h.scratchpadCalls).toHaveLength(4);
  });

  it("revokes live broadcasts with the local execution generation", async () => {
    const res = await callLocal("POST", "/stream", { text: "salut" }, LOCAL_GEN - 1);
    expect(res.status).toBe(403);
    expect(h.runReads).toBe(1);
    expect(h.afterWork).toEqual([]);
  });

  it("rejects completed cloud runs on every privileged surface", async () => {
    h.run = { ...h.run!, status: "completed", local_exec: true, local_exec_gen: LOCAL_GEN };
    expect((await call("POST", "/repo-auth")).status).toBe(409);
    expect((await call("POST", "/events", { type: "assistant_message" })).status).toBe(409);
  });
});

describe("the control plane seen from the built-in server sandbox", () => {
  const callServer = (
    method: string,
    surface: string,
    body: Record<string, unknown> | null = null,
  ) => handleControlPlaneRequest({ runId: RUN_ID, method, surface, body, server: true });

  it("admits a running server job and rejects a desktop-local or completed job", async () => {
    h.run = { ...h.run!, local_exec: false, status: "running" };
    expect((await callServer("POST", "/events", { type: "assistant_message" })).status).toBe(200);

    h.run = { ...h.run!, local_exec: true, status: "running" };
    expect((await callServer("POST", "/events", { type: "assistant_message" })).status).toBe(403);

    h.run = { ...h.run!, local_exec: false, status: "completed" };
    expect((await callServer("POST", "/events", { type: "assistant_message" })).status).toBe(409);
  });

  it("never returns a provider key to a server sandbox", async () => {
    h.run = { ...h.run!, local_exec: false, status: "running", key_mode: "byok" };

    const res = await callServer("POST", "/llm-key");

    expect(res.status).toBe(403);
    expect(h.minted).toEqual([]);
  });
});
