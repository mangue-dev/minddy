import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-147 — la FIN d'une chaîne, et les deux façons très différentes d'y arriver.
 *
 * Quand plus aucune règle ne matche, le moteur conclut. Mais « plus rien à
 * jouer » recouvre deux situations opposées : la chaîne est allée au bout de son
 * parcours, ou le run qui vient de finir a ÉCHOUÉ — et aucune règle ne réagit à
 * un échec, puisque les préréglages guettent tous `outcome: "ok"`.
 *
 * Les confondre coûte cher : la chaîne poste « la chaîne est allée au bout » sur
 * un ticket dont l'implémentation vient de mourir, et l'analytics compte un
 * `outcome: "completed"`. C'est exactement ce que le motif `run_failed` de
 * `STOP_REASONS` attendait, et ce que le routage de `requeueStuckRuns` vers
 * `stampRun` promettait — « un run abandonné par le balayeur ARRÊTE sa chaîne ».
 */

const h = vi.hoisted(() => ({
  /** Lignes rendues par `maybeSingle()`, table par table. */
  single: {} as Record<string, unknown>,
  /** Lignes rendues quand le builder est awaité tel quel (embed/liste). */
  many: {} as Record<string, unknown[]>,
  ownerMeta: null as Record<string, unknown> | null,
  chain: null as Record<string, unknown> | null,
  activeRun: null as unknown,
  verdict: null as { ok: boolean; summary: string; blockers: string[] } | null,
}));

/** Double de chaîne PostgREST : tout renvoie `this`, seules les fins résolvent. */
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
  activeRunForIssue: vi.fn(async () => h.activeRun),
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
  openChain: vi.fn(async () => h.chain),
  retryChain: vi.fn(
    async (chain: { retries: number; played_rule_ids: string[] }, replay: string[]) => ({
      ...chain,
      retries: chain.retries + 1,
      played_rule_ids: chain.played_rule_ids.filter((id) => !replay.includes(id)),
    }),
  ),
  lastVerdictOfChain: vi.fn(async () => h.verdict),
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

/** Une chaîne vivante qui a déjà joué son unique étape d'implémentation. */
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
  // Le préréglage du propriétaire gouverne : une seule règle, déjà jouée — donc
  // plus rien ne matche, quel que soit le sort du run.
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
    // Et surtout : rien n'est relancé sur un travail qui vient de mourir.
    expect(actions.runAction).not.toHaveBeenCalled();
  });

  it("un run RÉUSSI sans règle suivante termine la chaîne, comme avant", async () => {
    await finish("ok");
    expect(report.finishChain).toHaveBeenCalledWith(expect.objectContaining({ id: "chain-1" }));
    expect(report.haltChain).not.toHaveBeenCalled();
  });

  it("un run en échec qu'une règle PRÉVOIT joue cette règle, sans arrêt", async () => {
    // Une règle écrite à la main (API/MCP) peut réagir à l'échec : c'est le sens
    // de `outcome` sur le déclencheur, et l'arrêt ne doit pas le court-circuiter.
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
    // Une reprise est une étape de la MÊME chaîne sur le MÊME ticket : la
    // relancer avec un autre modèle que celui réglé pour cette taille n'aurait
    // aucune raison d'être — et le réglage de compte est justement celui que
    // l'utilisateur voit et manipule.
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
    // Sans `viaAutomation`, la timeline écrit « Numo a changé le statut » —
    // indiscernable d'un run lancé à la main, alors que personne n'a cliqué.
    h.ownerMeta = { automation_preset: "loop-by-effort" };
    h.verdict = { ok: false, summary: "Toujours pas.", blockers: [] };
    h.chain = {
      ...livingChain(),
      preset: "loop-by-effort",
      step: 5,
      retries: 1, // reprise déjà consommée → deuxième échec = arrêt + triage
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
