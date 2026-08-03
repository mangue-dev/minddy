import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRun } from "@/lib/server/agent/runs";

/**
 * MIN-147 — le crochet de fin de run, et le seul repos qui n'en est pas un.
 *
 * `ask_user` termine le tour de l'agent en `completed` avec `awaiting_input` :
 * du point de vue du run, c'est un repos ; du point de vue du TRAVAIL, c'est une
 * question restée sans réponse. Enchaîner là-dessus lance l'étape suivante par
 * dessus la question — qui part alors avec le run, sans que personne ne l'ait
 * lue. La dépense se cumule quand même : elle a bien eu lieu.
 */

const C = vi.hoisted(() => ({ chain: null as Record<string, unknown> | null }));

vi.mock("./chain", () => ({
  recomputeChainSpend: vi.fn(async () => 0),
  chainForIssue: vi.fn(async () => C.chain),
  cancelPendingChain: vi.fn(async () => null),
}));
vi.mock("./engine", () => ({ scheduleAutomations: vi.fn() }));

const { notifyChainOfRunEnd, handOffToHuman } = await import("./hooks");
const chain = await import("./chain");
const engine = await import("./engine");

function run(extra: Partial<AgentRun>): AgentRun {
  return {
    id: "run-1",
    project_id: "p1",
    issue_id: "i1",
    chain_id: "chain-1",
    status: "completed",
    cost_usd: 0.25,
    intent: "plan",
    awaiting_input: false,
    ...extra,
  } as AgentRun;
}

/** Le crochet est fire-and-forget : on laisse la chaîne de promesses se vider. */
async function settle() {
  await vi.waitFor(() => expect(chain.recomputeChainSpend).toHaveBeenCalled());
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => vi.clearAllMocks());

describe("notifyChainOfRunEnd", () => {
  it("un run qui ATTEND une réponse ne fait pas avancer la chaîne", async () => {
    notifyChainOfRunEnd(run({ awaiting_input: true }));
    await settle();
    // La dépense, oui — elle a eu lieu. L'étape suivante, non.
    expect(chain.recomputeChainSpend).toHaveBeenCalledWith("chain-1");
    expect(engine.scheduleAutomations).not.toHaveBeenCalled();
  });

  it("un repos ordinaire enchaîne, avec l'intention du run", async () => {
    notifyChainOfRunEnd(run({}));
    await settle();
    expect(engine.scheduleAutomations).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: "i1",
        chainId: "chain-1",
        event: { type: "run_finished", intent: "plan", outcome: "ok" },
      }),
    );
  });

  it("un run terminé en échec remonte `failed`, pas `ok`", async () => {
    notifyChainOfRunEnd(run({ status: "failed" }));
    await settle();
    expect(engine.scheduleAutomations).toHaveBeenCalledWith(
      expect.objectContaining({
        event: { type: "run_finished", intent: "plan", outcome: "failed" },
      }),
    );
  });

  it("prendre la main annule le SURSIS, jamais une chaîne qui tourne", async () => {
    // Les gestes manuels qui ne déplacent PAS le ticket — lancer un plan, une
    // vérification, une consigne libre, copier l'un de ces prompts — ne se
    // voient nulle part ailleurs : sans ce signal, le sursis courait jusqu'au
    // bout et Numo repartait sur un travail déjà pris en charge.
    C.chain = { id: "chain-1", status: "pending" };
    handOffToHuman("i1");
    await vi.waitFor(() => expect(chain.cancelPendingChain).toHaveBeenCalled());
    expect(chain.cancelPendingChain).toHaveBeenCalledWith("chain-1", "taken_over");
  });

  it("une chaîne qui TOURNE n'est pas touchée par une prise en main", async () => {
    // Ce cas-là est déjà arbitré à la source : le lancement manuel est refusé
    // (`alreadyRunning`). Annuler ici couperait une chaîne en plein travail.
    C.chain = { id: "chain-1", status: "running" };
    handOffToHuman("i1");
    await vi.waitFor(() => expect(chain.chainForIssue).toHaveBeenCalled());
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(chain.cancelPendingChain).not.toHaveBeenCalled();
  });

  it("un run sans chaîne ne réveille rien", async () => {
    notifyChainOfRunEnd(run({ chain_id: null }));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(chain.recomputeChainSpend).not.toHaveBeenCalled();
    expect(engine.scheduleAutomations).not.toHaveBeenCalled();
  });
});
