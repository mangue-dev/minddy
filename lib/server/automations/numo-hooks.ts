import "server-only";

import { afterOrNow } from "@/lib/server/after-safe";
import type { NumoTurn } from "@/lib/server/numo/turns";

/**
 * Let an automation observe the parent Numo operation, never an intermediate
 * code worker. Non-terminal states remain attached to the same chain step;
 * duplicate terminal delivery is harmless because advancing the next rule is
 * guarded by the chain's compare-and-set.
 */
export function notifyAutomationOfNumoTurn(turn: NumoTurn): void {
  const operation = turn.intent.automation;
  if (!operation) return;

  afterOrNow(async () => {
    const {
      getChain,
      numoAutomationOperationForTurn,
      recomputeChainSpend,
    } = await import("./chain");
    const chain = await getChain(operation.chainId);
    if (!chain) return;

    await recomputeChainSpend(chain.id);

    if (turn.status === "completed") {
      const recorded = await numoAutomationOperationForTurn(turn.id);
      if (!recorded?.outcome) {
        const { haltChain } = await import("./report");
        await haltChain(chain, "numo_outcome_missing");
        return;
      }
      const { scheduleAutomations } = await import("./engine");
      scheduleAutomations({
        issueId: chain.issue_id,
        projectId: chain.project_id,
        chainId: chain.id,
        event: {
          type: "run_finished",
          intent: operation.mode,
          outcome: recorded.outcome,
        },
      });
      return;
    }

    if (turn.status === "failed" || turn.status === "stopped") {
      const { haltChain } = await import("./report");
      await haltChain(
        chain,
        turn.status === "stopped" ? "interrupted" : "numo_failed",
      );
    }
  });
}
