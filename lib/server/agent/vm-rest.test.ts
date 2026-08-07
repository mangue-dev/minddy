import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VmTurnReport } from "./vm/protocol";

/**
 * MIN-224 — la fin d'un tour joué dans la microVM.
 *
 * DEUX CHOSES DISPARAÎTRAIENT EN SILENCE si personne ne les gardait, et ce sont
 * exactement celles que ces tests tiennent.
 *
 * 1. **Le métrage compute.** `recordSandboxUsage` facturait le wall-clock du
 *    chunk depuis le `finally` de la fonction. Sans chunk, plus personne ne tient
 *    cette horloge : c'est la boucle qui la remonte. Si on l'oublie, la moitié
 *    compute de la facture cesse d'être imputée — et rien ne le dit, jusqu'à ce
 *    qu'on compare la marge à la facture Vercel.
 * 2. **La sortie de `running`.** Un run que la mise au repos laisse `running` est
 *    une conversation bloquée jusqu'au passage du chien de garde. Ça doit arriver
 *    quel que soit ce qui a échoué à côté — forge en panne, event refusé.
 *
 * On ne moque que ce qui sort du process. Les quatre sorties, l'ordre des events
 * et le contenu des stamps sont le vrai chemin.
 */

const h = vi.hoisted(() => ({
  sandboxUsage: [] as Array<Record<string, unknown>>,
  events: [] as Array<{ type: string; payload: Record<string, unknown> }>,
  stamped: [] as Array<Record<string, unknown>>,
  notifications: [] as string[],
  revoked: [] as string[],
  pendingMessages: false,
  /** La cible de clone. `null` = dépôt délié : l'atterrissage PR doit s'abstenir. */
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
  // L'atterrissage sur la forge est couvert par l'ancienne forme (il est PARTAGÉ,
  // c'est tout l'intérêt) : ici on vérifie qu'on l'appelle, pas ce qu'il fait.
  reopenIfRejectedWorkPushed: vi.fn(async () => {}),
  notePrCommits: vi.fn(async () => {}),
  resolveRunPrefs: vi.fn(async () => ({ locale: "fr" as const, numoDefaultStatus: "triage" })),
}));

const { landVmTurn } = await import("./vm-rest");
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
      // Le process de boucle est fini : laisser son id ferait constater au chien
      // de garde un décès sur un run déjà au repos, à chaque passage du cron.
      loop_command_id: null,
    });
    expect(rest?.checkpoint).toEqual(report().checkpoint);
    expect(h.notifications).toEqual(["agent_done"]);
  });

  it("fin de tour sur un ask_user : la session ATTEND", async () => {
    await landVmTurn(run(), report({ askedUser: true }));
    expect(h.stamped.find((f) => f.status === "completed")).toMatchObject({
      awaiting_input: true,
    });
    expect(h.notifications).toEqual(["agent_question"]);
  });

  it("un message arrivé pendant la finalisation RE-QUEUE au lieu de reposer", async () => {
    // Sans ça, le message reste en file sans personne pour le lire : l'utilisateur
    // écrit pendant le push, et l'agent ne lui répond jamais.
    h.pendingMessages = true;
    await landVmTurn(run(), report());
    expect(h.stamped.find((f) => f.status === "queued")).toBeDefined();
    expect(h.notifications).toEqual([]);
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
    // aussitôt un tour sans budget. Le message attend la reprise.
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
        changed: { files: [{ path: "a.ts", status: "modified", additions: 2, deletions: 1 }], truncated: false },
      }),
    );
    expect(h.events.find((e) => e.type === "files_changed")?.payload).toMatchObject({
      truncated: false,
    });
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
    // Les deux sont des MINORANTS : la colonne rate ce qu'un tour mort n'a pas
    // stampé, le ledger rate une insertion best-effort perdue.
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
