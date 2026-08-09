import type { AgentRunEvent } from "./agent-api";

/** Les quatre états qu'`update_plan` accepte (cf. lib/server/agent/tools.ts). */
export type PlanStepStatus = "pending" | "in_progress" | "completed" | "cancelled";

/** Une étape de la checklist de session, telle que l'agent l'a posée. */
export interface PlanStep {
  step: string;
  status: PlanStepStatus;
}

function coerceStatus(value: unknown): PlanStepStatus {
  return value === "in_progress" || value === "completed" || value === "cancelled"
    ? value
    : "pending";
}

/** Ce qui referme un tour, ou en ouvre un autre — hors events de sous-agent. */
function opensNewTurn(type: AgentRunEvent["type"]): boolean {
  return (
    type === "summary" ||
    type === "question" ||
    type === "quota_exhausted" ||
    type === "user_message"
  );
}

/**
 * La checklist du TOUR EN COURS, dans son dernier état.
 *
 * `update_plan` envoie à chaque fois le plan ENTIER : le dernier `plan_update`
 * dit donc tout, et les précédents ne sont que des photos périmées. Un plan vidé
 * (tableau vide) est un vrai signal — l'agent a abandonné sa checklist — et rend
 * ici un tableau vide, pas l'avant-dernier plan.
 *
 * Le TOUR, et pas la session — la même fenêtre que les sous-agents
 * ([agent-subagents](./agent-subagents.ts)), et pour la même raison. Un plan
 * décrit le travail qu'un tour s'est donné ; sa réponse rendue, il ne décrit
 * plus rien. Le garder afficherait, au-dessus de l'input où l'on tape la question
 * SUIVANTE, une checklist qui parle de la précédente — et son dernier état laisse
 * en plus croire qu'elle avance encore. Tant que l'agent n'a pas reposé ou
 * recoché un plan dans le nouveau tour, il n'y a rien à montrer.
 *
 * Seul le PARENT peut poser un plan : `update_plan` est un tool de contrôle,
 * retiré aux sous-agents (`SUBAGENT_FORBIDDEN_TOOLS`). Leurs events, eux, ne
 * referment pas le tour du parent — le résumé d'une fille n'est pas le sien.
 */
export function livePlan(events: AgentRunEvent[]): PlanStep[] {
  let latest: AgentRunEvent | null = null;
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (typeof e.payload?.subagent_id === "string") continue;
    if (e.type === "plan_update") latest = e;
    else if (opensNewTurn(e.type)) latest = null;
  }
  if (!latest) return [];

  const raw = latest.payload?.plan;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ step: typeof s.step === "string" ? s.step : "", status: coerceStatus(s.status) }))
    .filter((s) => s.step.trim().length > 0);
}
