import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-147 — the END of a string, and the two very different ways to get there.
 *
 * When no more rules match, the engine concludes. But “nothing left to play” covers two opposite situations: the chain has reached the end of its run, or the run that has just finished has FAILED — and no rule reacts to a failure, since the presets are all waiting for `outcome: "ok"`.
 *
 * Confusing them is expensive: the chain posts "the chain went to the end" on
 * a ticket whose implementation has just died, and the analytics counts a
 * `outcome: "completed"`. This is exactly what the `run_failed` pattern from
 * `STOP_REASONS` expected, and what routing from `requeueStuckRuns` to
 * `stampRun` promised — “a run aborted by the sweeper STOPs its chain .
 */

const h = vi.hoisted(() => ({
  /** Lignes rendues par `maybeSingle()`, table par table. */
  single: {} as Record<string, unknown>,
  /** Lines rendered when the builder is awaited as is (embed/list). */
  many: {} as Record<string, unknown[]>,
  ownerMeta: null as Record<string, unknown> | null,
  chain: null as Record<string, unknown> | null,
  activeRun: null as unknown,
  verdict: null as { ok: boolean; summary: string; blockers: string[] } | null,
}));

/** PostgREST string double: everything returns `this`, only endings resolve. */
function builder(table: string) {
  const query: Record<string, unknown> = {};
  const self = () => query;
  for (const method of [
    "select",
    "eq",
    "is",
    "in",
    "not",
    "gt",
    "order",
    "limit",
    "update",
    "insert",
  ]) {
    query[method] = self;
  }
  query.maybeSingle = async () => ({ data: h.single[table] ?? null, error: null });
  query.single = query.maybeSingle;
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: h.many[table] ?? [], error: null }).then(resolve);
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => builder(table),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { user_metadata: h.ownerMeta } } }),
      },
    },
  }),
}));

vi.mock("@/lib/server/entitlements", () => ({
  canUseAutomations: vi.fn(async () => true),
}));

vi.mock("@/lib/server/agent/runs", () => ({
  activeRunForChain: vi.fn(async (chainId: string) => {
    const run = h.activeRun as { chain_id?: string | null } | null;
    return run?.chain_id === chainId ? run : null;
  }),
  requestInterrupt: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/update-issue", () => ({
  updateIssueFields: vi.fn(async () => ({ ok: true })),
}));

vi.mock("./chain", () => ({
  chainForIssue: vi.fn(async () => h.chain),
  getChain: vi.fn(async () => h.chain),
  advanceChain: vi.fn(async (chain: { step: number; played_rule_ids: string[] }, ruleId: string) => ({
    ...chain,
    step: chain.step + 1,
    played_rule_ids: [...chain.played_rule_ids, ruleId],
  })),
  // No existing channel → we open a new one, at step 0.
  openChain: vi.fn(async () => ({
    id: "chain-new",
    project_id: "p1",
    issue_id: "i1",
    owner_id: "owner",
    preset: "loop-by-effort",
    status: "running",
    step: 0,
    played_rule_ids: [] as string[],
    retries: 0,
    spent_usd: 0,
    budget_usd: null,
    stop_reason: null,
    not_before: null,
    pending_event: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  })),
  retryChain: vi.fn(
    async (chain: { retries: number; played_rule_ids: string[] }, replay: string[]) => ({
      ...chain,
      retries: chain.retries + 1,
      played_rule_ids: chain.played_rule_ids.filter((id) => !replay.includes(id)),
    }),
  ),
  lastVerdictOfChain: vi.fn(async () => h.verdict),
  startPendingChain: vi.fn(async () => ({ ...h.chain, status: "running", not_before: null })),
  cancelPendingChain: vi.fn(async () => null),
}));

vi.mock("./actions", () => ({ runAction: vi.fn(async () => ({ kind: "launched" })) }));

vi.mock("./report", () => ({
  haltChain: vi.fn(async () => undefined),
  finishChain: vi.fn(async () => undefined),
  captureChainStarted: vi.fn(),
}));

const { runAutomations } = await import("./engine");
const report = await import("./report");
const actions = await import("./actions");
const updateIssue = await import("@/lib/server/update-issue");
const chainMod = await import("./chain");
const runsMod = await import("@/lib/server/agent/runs");

/** A living string that has already played its single implementation step. */
function livingChain() {
  return {
    id: "chain-1",
    project_id: "p1",
    issue_id: "i1",
    owner_id: "owner",
    preset: "implement-only",
    status: "running",
    step: 1,
    played_rule_ids: ["implement-only:implement"],
    retries: 0,
    spent_usd: 0,
    budget_usd: null,
    stop_reason: null,
    not_before: null,
    pending_event: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.single.projects = {
    id: "p1",
    key: "MIN",
    owner_id: "owner",
    automations_enabled: true,
    automations: [],
  };
  h.single.issues = {
    id: "i1",
    number: 42,
    title: "Un ticket",
    plan: null,
    status: "in_progress",
    priority: "none",
    effort: "m",
    assignee_id: null,
    automation_override: null,
  };
  h.many.issue_categories = [];
  // The owner's preset governs: only one rule, already played — so
  // nothing matches anymore, whatever the fate of the run.
  h.ownerMeta = { automation_preset: "implement-only" };
  h.chain = livingChain();
  h.activeRun = null;
  h.verdict = null;
});

const finish = (outcome: "ok" | "failed") =>
  runAutomations({
    issueId: "i1",
    projectId: "p1",
    chainId: "chain-1",
    event: { type: "run_finished", intent: "implement", outcome },
  });

describe("runAutomations — conclure une chaîne", () => {
  it("un run en ÉCHEC arrête la chaîne avec son motif, il ne la termine pas", async () => {
    await finish("failed");
    expect(report.haltChain).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chain-1" }),
      "run_failed",
    );
    expect(report.finishChain).not.toHaveBeenCalled();
    // And above all: nothing is restarted on a job that has just died.
    expect(actions.runAction).not.toHaveBeenCalled();
  });

  it("un run RÉUSSI sans règle suivante termine la chaîne, comme avant", async () => {
    await finish("ok");
    expect(report.finishChain).toHaveBeenCalledWith(expect.objectContaining({ id: "chain-1" }));
    expect(report.haltChain).not.toHaveBeenCalled();
  });

  it("un run en échec qu'une règle PRÉVOIT joue cette règle, sans arrêt", async () => {
    // A hand-written rule (API/MCP) can react to failure: this is the meaning
    // of `outcome` on the trigger, and stopping should not short it.
    h.single.projects = {
      ...(h.single.projects as Record<string, unknown>),
      automations: [
        {
          id: "rescue",
          when: { type: "run_finished", intent: ["implement"], outcome: "failed" },
          then: [{ type: "run_numo", mode: "custom", prompt: "reprends" }],
        },
      ],
    };
    h.chain = { ...livingChain(), played_rule_ids: [] };
    await finish("failed");
    expect(actions.runAction).toHaveBeenCalledTimes(1);
    expect(report.haltChain).not.toHaveBeenCalled();
    expect(report.finishChain).not.toHaveBeenCalled();
  });

  it("la reprise après vérification en échec garde le modèle de la TAILLE", async () => {
    // A restart is a step in the SAME chain on the SAME ticket: the
    // restart with another model than the one set for this size would not have
    // no reason to exist — and the account setting is precisely what
    // the user sees and manipulates.
    h.ownerMeta = {
      automation_preset: "loop-by-effort",
      automation_models: { m: "vendor/m" },
    };
    h.verdict = { ok: false, summary: "Les tests ne passent pas.", blockers: ["lib/foo.ts"] };
    h.chain = {
      ...livingChain(),
      preset: "loop-by-effort",
      step: 3,
      retries: 0,
      played_rule_ids: [
        "loop-by-effort:medium-plan",
        "loop-by-effort:medium-implement",
        "loop-by-effort:medium-verify",
      ],
    };

    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      chainId: "chain-1",
      event: { type: "run_finished", intent: "verify", outcome: "ok" },
    });

    expect(actions.runAction).toHaveBeenCalledTimes(1);
    const call = vi.mocked(actions.runAction).mock.calls[0][0];
    expect(call.model).toBe("vendor/m");
    expect(call.action).toMatchObject({ type: "run_numo", mode: "implement" });
    expect(call.extraPrompt).toContain("Les tests ne passent pas.");
    expect(report.haltChain).not.toHaveBeenCalled();
  });

  it("la remise en triage est signée par l'AUTOMATISATION, pas par l'assigné", async () => {
    // Without `viaAutomation`, the timeline writes “Numo has changed the status” —
    // indistinguishable from a run launched by hand, when no one clicked.
    h.ownerMeta = { automation_preset: "loop-by-effort" };
    h.verdict = { ok: false, summary: "Toujours pas.", blockers: [] };
    h.chain = {
      ...livingChain(),
      preset: "loop-by-effort",
      step: 5,
      retries: 1, // recovery already consumed → second failure = stop + triage
      played_rule_ids: ["loop-by-effort:medium-verify"],
    };

    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      chainId: "chain-1",
      event: { type: "run_finished", intent: "verify", outcome: "ok" },
    });

    expect(report.haltChain).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chain-1" }),
      "verification_failed",
      expect.anything(),
    );
    expect(updateIssue.updateIssueFields).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { status: "triage" },
        viaAssistant: true,
        viaAutomation: true,
      }),
    );
  });

  it("l'ORIGINE du changement de statut arrive jusqu'aux règles", async () => {
    // The complete wiring: `updateIssueFields` → `scheduleStatusAutomations` →
    // the event → `nextRule`. Without it, the original condition would be written
    // in the presets but never evaluated.
    h.chain = null;
    // Reprieve at zero: this test concerns the ORIGIN, not the delay.
    h.ownerMeta = { automation_preset: "loop-by-effort", automation_start_delay_min: 0 };
    const enterTodo = (source: "web" | "mcp") =>
      runAutomations({
        issueId: "i1",
        projectId: "p1",
        event: { type: "status_changed", from: "backlog", to: "todo", source },
      });

    // My MCP agent puts away his ticket: he describes his own work, he does not
    // don't ask for a second one to be thrown at it.
    await enterTodo("mcp");
    expect(actions.runAction).not.toHaveBeenCalled();

    // Me moving the card: there, yes.
    await enterTodo("web");
    expect(actions.runAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(actions.runAction).mock.calls[0][0].action).toMatchObject({
      type: "run_numo",
      mode: "plan",
    });
  });

  it("le SURSIS ouvre la chaîne en attente, sans rien lancer", async () => {
    h.chain = null;
    h.ownerMeta = { automation_preset: "loop-by-effort" }; // 5 min by default
    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      event: { type: "status_changed", from: "backlog", to: "todo", source: "web" },
    });

    // Nothing is launched, nothing is spent: the chain waits.
    expect(actions.runAction).not.toHaveBeenCalled();
    const opened = vi.mocked(chainMod.openChain).mock.calls[0][0];
    expect(opened.notBefore).toBeTruthy();
    expect(Date.parse(opened.notBefore as string)).toBeGreaterThan(Date.now());
    // The event is set aside: it will be played again, and its `to` is used
    // de condition de survie.
    expect(opened.pendingEvent).toEqual({ to: "todo", source: "web" });
    // The opening analytics is NOT issued: nothing has started.
    expect(report.captureChainStarted).not.toHaveBeenCalled();
  });

  it("la fin d'un run n'attend JAMAIS — on est déjà engagé", async () => {
    // The reprieve protects the BOOT. Once the chain is gone, wait
    // the next step would no longer protect anything: the expense has already been made.
    h.ownerMeta = { automation_preset: "implement-only" }; // 5 min by default
    h.chain = { ...livingChain(), played_rule_ids: [] };
    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      chainId: "chain-1",
      event: { type: "run_finished", intent: "plan", outcome: "ok" },
    });
    // `implement-only` does not react to `run_finished` → nothing to play, but the
    // point is elsewhere: no channel has been suspended.
    expect(vi.mocked(chainMod.openChain)).not.toHaveBeenCalled();
  });

  it("le ticket parti ailleurs pendant le sursis annule la chaîne EN SILENCE", async () => {
    // The case “I copied the prompt to do it myself”: the copy moves
    // the ticket in `in_progress`, so it is no longer in the status which had
    // open the channel. No comments, no notifications: nothing happened.
    h.ownerMeta = { automation_preset: "loop-by-effort" };
    h.chain = {
      ...livingChain(),
      status: "pending",
      step: 0,
      played_rule_ids: [],
      pending_event: { to: "todo", source: "web" },
    };
    h.single.issues = {
      ...(h.single.issues as Record<string, unknown>),
      status: "in_progress",
    };

    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      chainId: "chain-1",
      startPending: true,
      event: { type: "status_changed", from: null, to: "todo", source: "web" },
    });

    expect(chainMod.cancelPendingChain).toHaveBeenCalledWith("chain-1", "superseded");
    expect(chainMod.startPendingChain).not.toHaveBeenCalled();
    expect(actions.runAction).not.toHaveBeenCalled();
    expect(report.haltChain).not.toHaveBeenCalled(); // silencieux
  });

  it("le ticket TOUJOURS là au réveil : la chaîne démarre pour de bon", async () => {
    h.ownerMeta = { automation_preset: "loop-by-effort" };
    h.chain = {
      ...livingChain(),
      status: "pending",
      step: 0,
      played_rule_ids: [],
      pending_event: { to: "todo", source: "web" },
    };
    h.single.issues = { ...(h.single.issues as Record<string, unknown>), status: "todo" };

    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      chainId: "chain-1",
      startPending: true,
      event: { type: "status_changed", from: null, to: "todo", source: "web" },
    });

    expect(chainMod.startPendingChain).toHaveBeenCalledWith("chain-1");
    expect(chainMod.cancelPendingChain).not.toHaveBeenCalled();
    expect(actions.runAction).toHaveBeenCalledTimes(1);
    // The opening analytics starts HERE, at the real start.
    expect(report.captureChainStarted).toHaveBeenCalled();
  });

  it("une conversation indépendante ne bloque pas le réveil de la chaîne", async () => {
    // The ticket is no longer the execution identity: a manual conversation and
    // the chain each have their own workspace and can progress in parallel.
    h.ownerMeta = { automation_preset: "loop-by-effort" };
    h.activeRun = { id: "run-manuel" };
    h.chain = {
      ...livingChain(),
      status: "pending",
      step: 0,
      played_rule_ids: [],
      pending_event: { to: "todo", source: "web" },
    };
    h.single.issues = { ...(h.single.issues as Record<string, unknown>), status: "todo" };

    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      chainId: "chain-1",
      startPending: true,
      event: { type: "status_changed", from: null, to: "todo", source: "web" },
    });

    expect(chainMod.startPendingChain).toHaveBeenCalledWith("chain-1");
    expect(chainMod.cancelPendingChain).not.toHaveBeenCalled();
    expect(actions.runAction).toHaveBeenCalledTimes(1);
  });

  it("un humain qui RANGE le ticket retire la chaîne, même en plein run", async () => {
    // The central guard. A committed channel never looked at their ticket again:
    // its `run_finished` triggers have no status conditions, and the
    // status hook exited early as soon as a run was working. We canceled a
    // ticket, the next step still started, and the launch CRASHED
    // cancellation by re-entering the “in progress” ticket.
    h.ownerMeta = { automation_preset: "loop-by-effort" };
    h.chain = { ...livingChain(), preset: "loop-by-effort" };
    h.activeRun = { id: "run-chaine", chain_id: "chain-1" };

    for (const to of ["canceled", "backlog", "done", "duplicate", "triage"] as const) {
      vi.clearAllMocks();
      await runAutomations({
        issueId: "i1",
        projectId: "p1",
        event: { type: "status_changed", from: "in_progress", to, source: "web" },
      });
      expect(report.haltChain).toHaveBeenCalledWith(
        expect.objectContaining({ id: "chain-1" }),
        "taken_over",
      );
      // The run of the chain leaves with it: letting it finish means spending
      // on a ticket that its owner has just put away.
      expect(runsMod.requestInterrupt).toHaveBeenCalledWith("run-chaine");
      expect(actions.runAction).not.toHaveBeenCalled();
    }
  });

  it("…mais PAS sur les statuts que la chaîne traverse elle-même", async () => {
    h.ownerMeta = { automation_preset: "loop-by-effort" };
    h.chain = { ...livingChain(), preset: "loop-by-effort" };
    h.activeRun = { id: "run-chaine", chain_id: "chain-1" };

    for (const to of ["todo", "in_progress", "in_review"] as const) {
      vi.clearAllMocks();
      await runAutomations({
        issueId: "i1",
        projectId: "p1",
        event: { type: "status_changed", from: "todo", to, source: "web" },
      });
      expect(report.haltChain).not.toHaveBeenCalled();
      expect(runsMod.requestInterrupt).not.toHaveBeenCalled();
    }
  });

  it("…ni quand c'est le CYCLE DE VIE d'un run qui écrit le statut", async () => {
    // A merged PR passes the ticket to `done` with the origin `agent`: this is
    // the success of the channel, not someone who takes it away.
    h.ownerMeta = { automation_preset: "loop-by-effort" };
    h.chain = { ...livingChain(), preset: "loop-by-effort" };
    h.activeRun = { id: "run-chaine", chain_id: "chain-1" };

    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      event: { type: "status_changed", from: "in_review", to: "done", source: "agent" },
    });
    expect(report.haltChain).not.toHaveBeenCalled();
  });

  it("le ticket ou le projet supprimé ÉTEINT la chaîne au lieu de l'abandonner", async () => {
    // Abandoned, she remained alive forever — and at the head of the queue
    // sweeper, where a handful was enough to starve the entire platform.
    h.chain = livingChain();
    h.single.issues = null;
    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      event: { type: "run_finished", intent: "implement", outcome: "ok" },
    });
    expect(report.haltChain).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chain-1" }),
      "gone",
    );
  });

  it("désarmer le projet éteint aussi une chaîne GARÉE", async () => {
    // `shutDownChain` only covered `pending` and `running`: a string at
    // human stopping point remained parked forever, including unique index.
    h.chain = { ...livingChain(), status: "awaiting_human" };
    h.single.projects = {
      ...(h.single.projects as Record<string, unknown>),
      automations_enabled: false,
    };
    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      event: { type: "run_finished", intent: "plan", outcome: "ok" },
    });
    expect(report.haltChain).toHaveBeenCalledWith(
      expect.objectContaining({ status: "awaiting_human" }),
      "disabled",
    );
  });

  it("un événement sans chaîne ne conclut rien du tout", async () => {
    h.chain = null;
    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      event: { type: "run_finished", intent: "verify", outcome: "failed" },
    });
    expect(report.haltChain).not.toHaveBeenCalled();
    expect(report.finishChain).not.toHaveBeenCalled();
  });
});
