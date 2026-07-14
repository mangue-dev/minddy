import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { parsePlan, setTaskState, type PlanTaskState } from "@/lib/plan";
import { planStateChanges } from "./plan-sync-core";

/**
 * Miroir des états d'avancement du checklist de l'agent (tool update_plan) vers
 * le plan d'implémentation de l'issue liée (MIN-46) — l'issue reflète la progression.
 *
 * Contrainte de sûreté : ne bascule QUE l'état des cases déjà présentes dans le
 * plan de l'issue. Jamais de réécriture, réordonnancement ni suppression du TEXTE
 * des tâches de l'utilisateur. Pas de plan, ou aucune étape de l'agent ne
 * correspond à une tâche existante → no-op.
 *
 * Best-effort et non bloquant : tout le corps est enveloppé pour ne JAMAIS lever
 * dans le run de l'agent (échec DB, plan malformé… sont avalés).
 */
export async function syncIssuePlanStates(
  issueId: string,
  steps: Array<{ step: string; status: PlanTaskState }>
): Promise<void> {
  try {
    if (!issueId || steps.length === 0) return;

    const service = getServiceClient();
    // Read-compute-CAS, avec quelques reprises : on n'écrit QUE si `plan` n'a pas
    // changé depuis la lecture (write full-column) → jamais d'écrasement d'une
    // édition user/MCP concurrente (perte de mise à jour). Best-effort : on
    // abandonne après quelques tentatives.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await service
        .from("issues")
        .select("plan")
        .eq("id", issueId)
        .maybeSingle();

      const plan = (data as { plan?: string | null } | null)?.plan;
      if (!plan || !plan.trim()) return;

      const { tasks } = parsePlan(plan);
      const changes = planStateChanges(tasks, steps);
      if (changes.length === 0) return;

      // Bascule état par état : setTaskState réécrit UNIQUEMENT le marqueur d'une
      // ligne (via task.line) et laisse chaque autre octet intact → le texte des
      // tâches ne peut pas être altéré.
      let next = plan;
      for (const change of changes) {
        const task = tasks[change.index];
        if (!task) continue;
        next = setTaskState(next, task.line, change.state);
      }
      if (next === plan) return;

      // CAS : garde `.eq("plan", plan)` → l'update ne s'applique que si personne n'a
      // touché la colonne entre-temps. Zéro ligne = édition concurrente → on recalcule.
      const { data: updated } = await service
        .from("issues")
        .update({ plan: next })
        .eq("id", issueId)
        .eq("plan", plan)
        .select("id");
      if (updated && updated.length > 0) return;
    }
  } catch (err) {
    // Non bloquant : un échec de synchro ne doit jamais faire échouer le run.
    console.error("[agent-plan-sync] failed:", (err as Error).message);
  }
}
