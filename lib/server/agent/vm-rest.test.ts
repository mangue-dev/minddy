import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VmTurnReport } from "./vm/protocol";

/**
 * MIN-224 — the end of a trick played in the microVM.
 *
 * TWO THINGS WOULD SILENTLY DISAPPEAR if no one was guarding them, and they are
 * exactly the ones these tests hold.
 *
 * 1. **The compute footage.** `recordSandboxUsage` charged the wall-clock of the
 * chunk from the `finally` of the function. Without chunk, no one holds
 * this clock anymore: it's the loop that winds it. If we forget it, the computed half
 * of the invoice stops being charged — and nothing says it, until
 * we compare the margin to the Vercel invoice.
 * 2. **The output of `running`.** A run that idling leaves behind `running` is
 * a conversation blocked until the watchdog passes. It must happen
 * whatever failed nearby — forge down, event refused.
 *
 * We only mock what comes out of the process. The four outputs, the order of events
 * and the contents of the stamps are the true path.
 */

const h = vi.hoisted(() => ({
  sandboxUsage: [] as Array<Record<string, unknown>>,
  events: [] as Array<{ type: string; payload: Record<string, unknown> }>,
  stamped: [] as Array<Record<string, unknown>>,
  notifications: [] as string[],
  revoked: [] as string[],
  pendingMessages: false,
  /** The database REFUSES a write that carries the checkpoint (null byte in it). */
  stampFails: false,
  /** The clone target. `null` = deposit untied: landing PR must refrain. */
  target: null as Record<string, unknown> | null,
  run: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/server/usage", () => ({
  recordSandboxUsage: vi.fn(async (p: Record<string, unknown>) => {
    h.sandboxUsage.push(p);
  }),
}));

vi.mock("@/lib/server/ai-usage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-usage")>()),
  spentFromLedger: vi.fn(async () => 0.5),
}));

vi.mock("./runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./runs")>()),
  appendEvent: vi.fn(async (_runId: string, type: string, payload: Record<string, unknown>) => {
    h.events.push({ type, payload });
  }),
  stampRun: vi.fn(async (_runId: string, fields: Record<string, unknown>) => {
    h.stamped.push(fields);
    return h.run as never;
  }),
  // The shutdown goes through it from MIN-286: it SAYS if the base refused,
  // where `stampRun` swallows its error (`h.stampFails` plays this refusal).
  stampRunResult: vi.fn(async (_runId: string, fields: Record<string, unknown>) => {
    h.stamped.push(fields);
    // The refusal DOES concern the checkpoint — it is he who carries what the model
    // wrote, so the null byte. The same writing without him works.
    return h.stampFails && "checkpoint" in fields
      ? { run: null, failed: true }
      : { run: h.run as never, failed: false };
  }),
  hasPendingRunMessages: vi.fn(async () => h.pendingMessages),
  clearInterrupt: vi.fn(async () => {}),
  notifyAgentRun: vi.fn(async (_run: unknown, type: string) => {
    h.notifications.push(type);
  }),
}));

vi.mock("./repo-access", () => ({
  resolveRepoCloneTarget: vi.fn(async () => h.target),
}));

vi.mock("./run-key", () => ({
  revokeRunKey: vi.fn(async (hash: string) => {
    h.revoked.push(hash);
  }),
}));

vi.mock("./quota", () => ({
  checkAgentQuota: vi.fn(async () => ({
    mode: "platform" as const,
    unlimited: false,
    remaining: 0,
    spent: 5,
    cap: 5,
    resetsAt: null,
    planId: "go",
    nextPlanId: "pro",
  })),
}));

vi.mock("./pr-landing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./pr-landing")>()),
  // Landing on the forge is covered by the old form (it is SHARED,
  // that's the whole point): here we check that we call it, not what it does.
  reopenIfRejectedWorkPushed: vi.fn(async () => {}),
  notePrCommits: vi.fn(async () => {}),
  resolveRunPrefs: vi.fn(async () => ({
    locale: "fr" as const,
    numoDefaultStatus: "triage",
    branchPrefix: "numo/",
  })),
}));

const { landVmTurn, billableSandboxMs, MAX_SANDBOX_MS } = await import("./vm-rest");
const { stampRun } = await import("./runs");

const RUN = {
  id: "11111111-2222-4333-8444-555555555555",
  run_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  project_id: "proj-1",
  issue_id: "issue-1",
  pull_request_id: null,
  created_by: "user-owner",
  routine_id: null,
  chain_id: null,
  branch_name: null,
  base_branch: "main",
  pr_number: null,
  pr_url: null,
  pr_state: null,
  cost_usd: 0.25,
  continuations: 0,
  budget_usd: null,
  provider_key_id: "hash-de-la-cle",
  model: "deepseek/deepseek-v4-flash",
  checkpoint: null,
};

function report(over: Partial<VmTurnReport> = {}): VmTurnReport {
  return {
    status: "completed",
    reply: "C'est fait.",
    costUsd: 0.4,
    checkpoint: { messages: [{ role: "user", content: "salut" }] },
    checkpointDropped: [],
    checkpointBytes: 1234,
    pushed: null,
    workBranch: "minddy/agent/min-42-abcd1234",
    sandboxMs: 3 * 60_000,
    ...over,
  };
}

beforeEach(() => {
  h.sandboxUsage.length = 0;
  h.events.length = 0;
  h.stamped.length = 0;
  h.notifications.length = 0;
  h.revoked.length = 0;
  h.pendingMessages = false;
  h.stampFails = false;
  h.target = null;
  h.run = { ...RUN };
});

const run = () => h.run as unknown as Parameters<typeof landVmTurn>[0];

describe("le métrage de la microVM change de main", () => {
  it("facture le wall-clock que la BOUCLE a mesuré, pas celui de la fonction", async () => {
    await landVmTurn(run(), report({ sandboxMs: 7 * 60_000 }));
    expect(h.sandboxUsage).toHaveLength(1);
    expect(h.sandboxUsage[0]).toMatchObject({
      runId: RUN.run_id,
      durationMs: 7 * 60_000,
      feature: "sandbox_compute",
      projectId: "proj-1",
      billTo: { userId: "user-owner" },
    });
  });

  it("range les minutes d'une ROUTINE avec elle", async () => {
    h.run = { ...RUN, routine_id: "routine-1" };
    await landVmTurn(run(), report());
    expect(h.sandboxUsage[0]).toMatchObject({ feature: "routine_compute" });
  });

  it("n'écrit rien quand le tour n'a pas duré (rapport de secours d'un crash)", async () => {
    await landVmTurn(run(), report({ sandboxMs: 0 }));
    expect(h.sandboxUsage).toHaveLength(0);
  });

  /**
 * MIN-329 — this duration directly becomes dollars in the account of the
 * owner of the run, and it is sent by the microVM. No VM lives
 * longer than its own timeout: beyond that, it is no longer a clock.
 */
  it("coupe une durée que la VM ne peut pas avoir vécue", async () => {
    await landVmTurn(run(), report({ sandboxMs: 1_000 * 24 * 60 * 60_000 }));
    expect(h.sandboxUsage[0]).toMatchObject({ durationMs: 24 * 60 * 60_000 });
  });

  it("n'écrit rien sur une durée impossible", async () => {
    await landVmTurn(run(), report({ sandboxMs: Number.NaN }));
    await landVmTurn(run(), report({ sandboxMs: -60_000 }));
    expect(h.sandboxUsage).toHaveLength(0);
  });

  /**
 * MIN-360 — NO VALUE OF FINANCIAL CONSEQUENCE COMES FROM A
 * LOCAL PROCESS WITHOUT SERVER TERMINAL.
 *
 * The report comes from the process we suspect. The “run local” mark,
 * is that of the LINE — placed at launch, never reread from the report: a diverted
 * harness would be called cloud, and would bill its
 * owner for Mac minutes.
 */
  it("ne facture RIEN de compute pour un run local, quoi que dise le rapport", async () => {
    h.run = { ...RUN, local_exec: true };
    await landVmTurn(run(), report({ sandboxMs: 90 * 60_000 }));
    expect(h.sandboxUsage).toHaveLength(0);
  });
});

describe("billableSandboxMs — la règle, seule", () => {
  it("borne un run cloud à la durée de vie d'une microVM", () => {
    expect(billableSandboxMs(7 * 60_000, { localExec: false })).toBe(7 * 60_000);
    expect(billableSandboxMs(1_000 * 24 * 60 * 60_000, { localExec: false })).toBe(MAX_SANDBOX_MS);
    expect(billableSandboxMs(-1, { localExec: false })).toBe(0);
    expect(billableSandboxMs(Number.NaN, { localExec: false })).toBe(0);
    expect(billableSandboxMs(Number.POSITIVE_INFINITY, { localExec: false })).toBe(0);
  });

  it("rend zéro pour un run local, y compris sur une durée plausible", () => {
    // There was no microVM: the machine is the one the user has
    // provided, and charging him for it would be the most discreet of thefts.
    expect(billableSandboxMs(7 * 60_000, { localExec: true })).toBe(0);
  });
});

describe("les quatre sorties, et elles quittent toutes `running`", () => {
  it("fin de tour : repos, réponse gardée, notification", async () => {
    await landVmTurn(run(), report());
    const rest = h.stamped.find((f) => f.status === "completed");
    expect(rest).toBeDefined();
    expect(rest).toMatchObject({
      status: "completed",
      outcome: "C'est fait.",
      awaiting_input: false,
      // The loop process is finished: leaving your id would make the dog notice
      // guard a death on a run already at rest, each time the cron passes.
      loop_command_id: null,
    });
    expect(rest?.checkpoint).toEqual(report().checkpoint);
    expect(h.notifications).toEqual(["agent_done"]);
  });

  /**
 * MIN-286 — THE STOP MUST SUCCEED EVEN IF THE DATABASE REFUSES.
 *
 * `stampRun` swallows its error: a refusal left the run `running` while the
 * VM had just returned its report and was going to die — no one left to
 * conclude, a thread frozen "in progress", and the watchdog who files it in
 * "the process has stopped" several minutes later. Lived on
 * 2026-08-12, on a null byte in the opencode log.
 */
  it("repose SANS son checkpoint plutôt que de laisser le run en cours", async () => {
    h.stampFails = true;
    await landVmTurn(run(), report());

    // Two attempts: the complete one, then the same without the field as the base
    // refused — the only one who is big and who comes from the model.
    const attempts = h.stamped.filter((f) => f.status === "completed");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toHaveProperty("checkpoint");
    expect(attempts[1]).not.toHaveProperty("checkpoint");
    // …and the user learns it, rather than resuming a conversation which
    // would have silently forgotten his last trick.
    expect(h.events.some((e) => e.payload?.code === "checkpointRefused")).toBe(true);
  });

  it("fin de tour sur un ask_user : la session ATTEND", async () => {
    await landVmTurn(run(), report({ askedUser: true }));
    expect(h.stamped.find((f) => f.status === "completed")).toMatchObject({
      awaiting_input: true,
    });
    expect(h.notifications).toEqual(["agent_question"]);
  });

  it("un message arrivé pendant la finalisation RE-QUEUE au lieu de reposer", async () => {
    // Without this, the message remains in queue with no one to read it: the user
    // writes during the push, and the agent never responds to it.
    h.pendingMessages = true;
    await landVmTurn(run(), report());
    expect(h.stamped.find((f) => f.status === "queued")).toBeDefined();
    expect(h.notifications).toEqual([]);
  });

  it("crash de la boucle : on GARDE le checkpoint périodique, on n'écrit rien dessus", async () => {
    // An EMERGENCY report does not include one: `runVmTurn` has lifted, its history
    // stayed in the middle of a round (a `tool_call` without its `tool_result`) and
    // writing it over the periodic save would break the next round —
    // losing `lastFilesSha` in the process, therefore the basis of the turn diff.
    const crash = report({ status: "error", errorMessage: "boom" });
    delete crash.checkpoint;
    await landVmTurn(run(), crash);
    const rest = h.stamped.find((f) => f.status === "completed");
    expect(rest).toBeDefined();
    expect(rest).not.toHaveProperty("checkpoint");
    expect(rest).toMatchObject({ error_message: "boom" });
  });

  it("erreur : repos reprennable, message d'erreur sur la ligne", async () => {
    await landVmTurn(run(), report({ status: "error", errorMessage: "boom" }));
    expect(h.stamped.find((f) => f.status === "completed")).toMatchObject({
      error_message: "boom",
    });
    expect(h.notifications).toEqual(["agent_failed"]);
  });

  it("interruption : repos, drapeau nettoyé, aucune notification", async () => {
    await landVmTurn(run(), report({ status: "interrupted" }));
    expect(h.stamped.find((f) => f.status === "completed")).toBeDefined();
    expect(h.notifications).toEqual([]);
  });

  it("budget épuisé : la carte qui dit pourquoi, et PAS de re-queue", async () => {
    // Volontairement insensible au steering en file : re-queuer relancerait
    // immediately a tour without a budget. The message waits for recovery.
    h.pendingMessages = true;
    await landVmTurn(run(), report({ status: "budget_exhausted" }));
    const quota = h.events.find((e) => e.type === "quota_exhausted");
    expect(quota).toBeDefined();
    expect(quota?.payload).toMatchObject({ cause: "account", nextPlanId: "pro" });
    expect(h.stamped.every((f) => f.status !== "queued")).toBe(true);
    expect(h.notifications).toEqual(["agent_failed"]);
  });
});

describe("ce que le fil doit dire", () => {
  it("annonce un push raté — sinon l'utilisateur croit le travail livré", async () => {
    await landVmTurn(run(), report({ pushError: "non-fast-forward" }));
    const err = h.events.find((e) => e.type === "error");
    expect(String(err?.payload.message)).toContain("non-fast-forward");
    expect(h.stamped.find((f) => f.status === "completed")).toMatchObject({
      error_message: "non-fast-forward",
    });
  });

  it("annonce une conversation perdue au rabotage, et elle seule", async () => {
    await landVmTurn(run(), report({ checkpointDropped: ["images", "toolOutputs"] }));
    expect(h.events.some((e) => e.payload.code === "turnHistoryReset")).toBe(false);
    h.events.length = 0;
    await landVmTurn(run(), report({ checkpointDropped: ["toolOutputs", "history"] }));
    expect(h.events.find((e) => e.payload.code === "turnHistoryReset")).toBeDefined();
  });

  it("émet le diff du tour, calculé par git DANS la VM", async () => {
    await landVmTurn(
      run(),
      report({
        changed: {
          files: [{ path: "a.ts", status: "modified", additions: 2, deletions: 1 }],
          truncated: false,
          diff: {
            files: [{ filename: "a.ts", status: "modified", additions: 2, deletions: 1, patch: "@@\n+x" }],
            truncated: false,
          },
        },
      }),
    );
    expect(h.events.find((e) => e.type === "files_changed")?.payload).toMatchObject({
      truncated: false,
      diff: { files: [{ filename: "a.ts", patch: "@@\n+x" }] },
    });
  });

  it("persiste aussi un snapshot local vide, qui signifie que le travail a été annulé", async () => {
    await landVmTurn(
      run(),
      report({
        changed: {
          files: [],
          truncated: false,
          diff: { files: [], truncated: false, snapshot: true },
        },
      }),
    );
    expect(h.events.find((e) => e.type === "files_changed")?.payload).toMatchObject({
      files: [],
      diff: { files: [], snapshot: true },
    });
  });
});

/**
 * MIN-219, GOT THIS PATH. A turn that the loop has `suspended` arrives here
 * in `error` with its cause in `errorCode` — and the two causes are not resolved
 * not the same: a turn ceiling is told and rests, a breakdown of
 * supplier EXPECTS.
 */
describe("un tour arrêté se raconte, et une panne de fournisseur se re-queue", () => {
  const stalled = (over: Partial<VmTurnReport> = {}) =>
    report({
      status: "error",
      errorCode: "providerUnavailable",
      errorMessage: "429 Too Many Requests",
      ...over,
    });

  it("repart en file avec un DÉLAI devant lui, et le compteur sur le checkpoint", async () => {
    await landVmTurn(run(), stalled());
    const requeue = h.stamped.find((f) => f.status === "queued");
    expect(requeue).toBeDefined();
    // The first level of `PROVIDER_REQUEUE_DELAYS_MS`: 30 s. Without delay, the
    // drain reclaims immediately and falls back into the same breakdown.
    const delayMs = Date.parse(String(requeue?.not_before)) - Date.now();
    expect(delayMs).toBeGreaterThan(20_000);
    expect(requeue?.checkpoint).toMatchObject({ providerRetries: 1 });
    // No rest, no failure notification: the round is not over.
    expect(h.stamped.some((f) => f.status === "completed")).toBe(false);
    expect(h.notifications).toEqual([]);
  });

  it("ne remet PAS d'event par-dessus la note du fil — le tour repart", async () => {
    await landVmTurn(run(), stalled());
    expect(h.events.some((e) => e.type === "error")).toBe(false);
  });

  it("nulle `loop_command_id` — sinon le chien de garde constate un décès sur un run en attente", async () => {
    await landVmTurn(run(), stalled());
    expect(h.stamped.find((f) => f.status === "queued")).toMatchObject({ loop_command_id: null });
  });

  it("retente TOUT DE SUITE quand l'utilisateur a écrit, mais compte quand même", async () => {
    // Making him wait ten minutes before only being READ would be worse than
    // original default. The emergency exit remains limited.
    h.pendingMessages = true;
    await landVmTurn(run(), stalled());
    const requeue = h.stamped.find((f) => f.status === "queued");
    expect(Date.parse(String(requeue?.not_before)) - Date.now()).toBeLessThan(1_000);
    expect(requeue?.checkpoint).toMatchObject({ providerRetries: 1 });
  });

  it("compte des pannes CONSÉCUTIVES : il repart du compteur porté par la ligne", async () => {
    h.run = { ...RUN, checkpoint: { messages: [], providerRetries: 2 } };
    await landVmTurn(run(), stalled());
    expect(h.stamped.find((f) => f.status === "queued")?.checkpoint).toMatchObject({
      providerRetries: 3,
    });
    // And the checkpoint of the SAIN turn does not rest it: `buildCheckpoint` does not
    // does not know this field, so the next failure will start from scratch.
    h.stamped.length = 0;
    await landVmTurn(run(), report());
    expect(h.stamped.find((f) => f.status === "completed")?.checkpoint).not.toHaveProperty(
      "providerRetries",
    );
  });

  it("à bout de patience : le repos honnête, avec le CODE que le fil traduit", async () => {
    // `MAX_PROVIDER_REQUEUES` is 4: at the fifth, we no longer queue.
    h.run = { ...RUN, checkpoint: { messages: [], providerRetries: 4 } };
    await landVmTurn(run(), stalled());
    expect(h.stamped.some((f) => f.status === "queued")).toBe(false);
    expect(h.events.find((e) => e.type === "error")?.payload).toMatchObject({
      code: "providerUnavailable",
    });
    // The supplier's message remains on the line: the only trace that says
    //WHICH of the breakdowns ended up stopping the tour.
    expect(h.stamped.find((f) => f.status === "completed")).toMatchObject({
      error_message: "429 Too Many Requests",
    });
    expect(h.notifications).toEqual(["agent_failed"]);
  });

  it("le plafond du tour se raconte par un CODE, pas par du silence", async () => {
    // Nothing in `components/agent/` reads `error_message`: without event, the end
    // of turn was MUTE in the thread.
    await landVmTurn(run(), report({ status: "error", errorCode: "turnTooLong" }));
    expect(h.events.find((e) => e.type === "error")?.payload).toMatchObject({
      code: "turnTooLong",
    });
    expect(h.stamped.some((f) => f.status === "queued")).toBe(false);
    expect(h.notifications).toEqual(["agent_failed"]);
  });

  it("une erreur ORDINAIRE n'invente pas de code — la boucle l'a déjà dite", async () => {
    await landVmTurn(run(), report({ status: "error", errorMessage: "402 Payment Required" }));
    expect(h.events.some((e) => e.type === "error")).toBe(false);
  });
});

describe("la branche vient du RAPPORT, pas d'une reconstruction", () => {
  it("enregistre la branche au premier push réel", async () => {
    h.target = { provider: "github", repoFullName: "org/repo", token: "t", authUrl: "u", defaultBranch: "main" };
    await landVmTurn(
      run(),
      report({ pushed: { pushed: true, remoteUpdated: true, headSha: "abc", committed: true } }),
    );
    expect(h.stamped.find((f) => f.branch_name)).toMatchObject({
      branch_name: "minddy/agent/min-42-abcd1234",
    });
  });

  it("n'enregistre rien quand le tour n'a rien poussé", async () => {
    await landVmTurn(run(), report({ pushed: { pushed: false, remoteUpdated: false, headSha: "", committed: false } }));
    expect(h.stamped.some((f) => f.branch_name)).toBe(false);
  });
});

describe("la dépense et la clé", () => {
  it("prend le PLUS GRAND du cumul et du ledger — une dépense ne recule pas", async () => {
    // Both are MINORANTS: the column misses what a dead turn does not
    // stamped, the ledger misses a lost best-effort insertion.
    await landVmTurn(run(), report({ costUsd: 0.1 }));
    expect(h.stamped.find((f) => f.status === "completed")?.cost_usd).toBe(0.5);
  });

  it("révoque la clé du run : plus personne n'a de raison de s'en servir", async () => {
    await landVmTurn(run(), report());
    expect(h.revoked).toEqual(["hash-de-la-cle"]);
  });
});

describe("l'atterrissage sur la forge ne peut pas bloquer la mise au repos", () => {
  it("repose quand même si `resolveRepoCloneTarget` explose", async () => {
    const { resolveRepoCloneTarget } = await import("./repo-access");
    vi.mocked(resolveRepoCloneTarget).mockRejectedValueOnce(new Error("forge en panne"));
    await landVmTurn(
      run(),
      report({ pushed: { pushed: true, remoteUpdated: true, headSha: "abc", committed: true } }),
    );
    expect(h.stamped.find((f) => f.status === "completed")).toBeDefined();
    expect(vi.mocked(stampRun)).toHaveBeenCalled();
  });
});
