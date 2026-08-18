import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { parsePlan, setTaskState, type PlanTaskState } from "@/lib/plan";
import { planStateChanges } from "./plan-sync-core";

/**
 * Mirror the progress states of the agent's checklist (tool update_plan) to
 * the implementation plan of the linked issue (MIN-46) — the issue reflects the progress.
 *
 * Safety constraint: ONLY toggles the state of the boxes already present in the
 * outcome plan. Never rewrite, reorder or delete TEXT
 * from user tasks. No plan, or no agent step does
 * corresponds to an existing task → no-op.
 *
 * Best-effort and non-blocking: the whole body is wrapped to NEVER raise
 * in the agent run (DB failure, malformed plan, etc. are swallowed).
 */
export async function syncIssuePlanStates(
  issueId: string,
  steps: Array<{ step: string; status: PlanTaskState }>
): Promise<void> {
  try {
    if (!issueId || steps.length === 0) return;

    const service = getServiceClient();
    // Read-compute-CAS, with a few repetitions: we ONLY write if `plan` does not have
    // changed since reading (write full-column) → never overwriting a
    // concurrent user/MCP edition (loss of update). Best effort: we
    // gives up after a few attempts.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await service
        .from("issues")
        .select("plan")
        .is("deleted_at", null)
        .eq("id", issueId)
        .maybeSingle();

      const plan = (data as { plan?: string | null } | null)?.plan;
      if (!plan || !plan.trim()) return;

      const { tasks } = parsePlan(plan);
      const changes = planStateChanges(tasks, steps);
      if (changes.length === 0) return;

      // Switch state by state: setTaskState ONLY rewrites the marker of a
      // line (via task.line) and leaves every other byte intact → the text of
      // tasks cannot be altered.
      let next = plan;
      for (const change of changes) {
        const task = tasks[change.index];
        if (!task) continue;
        next = setTaskState(next, task.line, change.state);
      }
      if (next === plan) return;

      // CAS : garde `.eq("plan", plan)` → l'update ne s'applique que si personne n'a
      // touched the column in the meantime. Zero line = concurrent edition → we recalculate.
      const { data: updated } = await service
        .from("issues")
        .update({ plan: next })
        .is("deleted_at", null)
        .eq("id", issueId)
        .eq("plan", plan)
        .select("id");
      if (updated && updated.length > 0) return;
    }
  } catch (err) {
    // Non-blocking: a sync failure should never cause the run to fail.
    console.error("[agent-plan-sync] failed:", (err as Error).message);
  }
}
