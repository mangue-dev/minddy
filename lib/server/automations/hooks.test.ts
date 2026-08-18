import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRun } from "@/lib/server/agent/runs";

/**
 * MIN-147 — the end-of-run hook, and the only rest that isn't a rest.
 *
 * `ask_user` ends the agent's turn at `completed` with `awaiting_input` :
 * from the point from the point of view of the run, it’s a rest; From a WORK perspective, this is an unanswered question. Continuing on this launches the next step by
 * on the question — which then leaves with the run, without anyone having
 * read it. The expense still accumulates: it has indeed taken place.
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

/** The hook is fire-and-forget: we let the promise chain empty. */
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
    // The expense, yes — it took place. The next step, no.
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
    // Manual gestures that do NOT move the ticket — launch a plan,
    // verification, a free instruction, copy one of these prompts — does not
    // see nowhere else: without this signal, the reprieve would run until
    // end and Numo started again on work already taken care of.
    C.chain = { id: "chain-1", status: "pending" };
    handOffToHuman("i1");
    await vi.waitFor(() => expect(chain.cancelPendingChain).toHaveBeenCalled());
    expect(chain.cancelPendingChain).toHaveBeenCalledWith("chain-1", "taken_over");
  });

  it("une chaîne qui TOURNE n'est pas touchée par une prise en main", async () => {
    // This case is already arbitrated at the source: manual launch is refused
    // (`alreadyRunning`). Canceling here would cut a channel mid-work.
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
