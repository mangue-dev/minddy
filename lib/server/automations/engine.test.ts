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
  // Pas de chaîne existante → on en ouvre une neuve, à l'étape 0.
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

  it("l'ORIGINE du changement de statut arrive jusqu'aux règles", async () => {
    // Le câblage complet : `updateIssueFields` → `scheduleStatusAutomations` →
    // l'événement → `nextRule`. Sans lui, la condition d'origine serait écrite
    // dans les préréglages mais jamais évaluée.
    h.chain = null;
    // Sursis à zéro : ce test-ci porte sur l'ORIGINE, pas sur le délai.
    h.ownerMeta = { automation_preset: "loop-by-effort", automation_start_delay_min: 0 };
    const enterTodo = (source: "web" | "mcp") =>
      runAutomations({
        issueId: "i1",
        projectId: "p1",
        event: { type: "status_changed", from: "backlog", to: "todo", source },
      });

    // Mon agent MCP range son ticket : il décrit son propre travail, il ne
    // demande pas qu'on en lance un deuxième dessus.
    await enterTodo("mcp");
    expect(actions.runAction).not.toHaveBeenCalled();

    // Moi qui déplace la carte : là, oui.
    await enterTodo("web");
    expect(actions.runAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(actions.runAction).mock.calls[0][0].action).toMatchObject({
      type: "run_numo",
      mode: "plan",
    });
  });

  it("le SURSIS ouvre la chaîne en attente, sans rien lancer", async () => {
    h.chain = null;
    h.ownerMeta = { automation_preset: "loop-by-effort" }; // 5 min par défaut
    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      event: { type: "status_changed", from: "backlog", to: "todo", source: "web" },
    });

    // Rien n'est lancé, rien n'est dépensé : la chaîne attend.
    expect(actions.runAction).not.toHaveBeenCalled();
    const opened = vi.mocked(chainMod.openChain).mock.calls[0][0];
    expect(opened.notBefore).toBeTruthy();
    expect(Date.parse(opened.notBefore as string)).toBeGreaterThan(Date.now());
    // L'événement est mis de côté : c'est lui qu'on rejouera, et son `to` sert
    // de condition de survie.
    expect(opened.pendingEvent).toEqual({ to: "todo", source: "web" });
    // L'analytique d'ouverture n'est PAS émise : rien n'a commencé.
    expect(report.captureChainStarted).not.toHaveBeenCalled();
  });

  it("la fin d'un run n'attend JAMAIS — on est déjà engagé", async () => {
    // Le sursis protège l'AMORÇAGE. Une fois la chaîne partie, faire patienter
    // l'étape suivante ne protégerait plus rien : la dépense est déjà faite.
    h.ownerMeta = { automation_preset: "implement-only" }; // 5 min par défaut
    h.chain = { ...livingChain(), played_rule_ids: [] };
    await runAutomations({
      issueId: "i1",
      projectId: "p1",
      chainId: "chain-1",
      event: { type: "run_finished", intent: "plan", outcome: "ok" },
    });
    // `implement-only` ne réagit pas à `run_finished` → rien à jouer, mais le
    // point est ailleurs : aucune chaîne n'a été mise en sursis.
    expect(vi.mocked(chainMod.openChain)).not.toHaveBeenCalled();
  });

  it("le ticket parti ailleurs pendant le sursis annule la chaîne EN SILENCE", async () => {
    // Le cas « j'ai copié le prompt pour le faire moi-même » : la copie déplace
    // le ticket en `in_progress`, donc il n'est plus dans le statut qui avait
    // ouvert la chaîne. Aucun commentaire, aucune notification : rien n'a tourné.
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
    // L'analytique d'ouverture part ICI, au vrai démarrage.
    expect(report.captureChainStarted).toHaveBeenCalled();
  });

  it("un run ACTIF ne réveille pas le sursis — sinon la chaîne devient zombie", async () => {
    // Réveiller d'abord et abandonner ensuite laissait une chaîne `running` à
    // l'étape 0, sans run à elle : plus jamais balayée (elle n'est plus
    // `pending`), plus jamais avancée (aucun run de chaîne ne finira), et
    // occupant l'index unique du ticket pour toujours.
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

    // Elle reste EN SURSIS : le balayage suivant la reproposera.
    expect(chainMod.startPendingChain).not.toHaveBeenCalled();
    expect(chainMod.cancelPendingChain).not.toHaveBeenCalled();
    expect(actions.runAction).not.toHaveBeenCalled();
  });

  it("un humain qui RANGE le ticket retire la chaîne, même en plein run", async () => {
    // La garde centrale. Une chaîne engagée ne regardait plus jamais son ticket :
    // ses déclencheurs `run_finished` n'ont aucune condition de statut, et le
    // crochet de statut sortait tôt dès qu'un run travaillait. On annulait un
    // ticket, l'étape suivante partait quand même, et le lancement ÉCRASAIT
    // l'annulation en repassant le ticket « en cours ».
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
      // Le run de la chaîne part avec elle : le laisser finir, c'est dépenser
      // sur un ticket que son propriétaire vient de ranger.
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
    // Une PR fusionnée passe le ticket en `done` avec l'origine `agent` : c'est
    // la réussite de la chaîne, pas quelqu'un qui la lui retire.
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
    // Abandonnée, elle restait vivante à jamais — et en tête de la file du
    // balayeur, où une poignée suffisait à affamer toute la plateforme.
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
    // `shutDownChain` ne couvrait que `pending` et `running` : une chaîne au
    // point d'arrêt humain restait garée pour toujours, index unique compris.
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
