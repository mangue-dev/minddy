import type { AgentRunEvent } from "./agent-api";

/** The four states that `update_plan` accepts (see lib/server/agent/tools.ts). */
export type PlanStepStatus = "pending" | "in_progress" | "completed" | "cancelled";

/** A session checklist step, as asked by the agent. */
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
 * The checklist for the CURRENT TOUR, in its latest state.
 *
 * `update_plan` sends the ENTIRE plan each time: the last `plan_update`
 * therefore says everything, and the previous ones are just outdated photos. An empty plan
 * (empty table) is a real signal — the agent has abandoned its checklist — and returns
 * here an empty table, not the penultimate plan.
 *
 * The TURN, not the session — the same window as the sub-agents
 * ([agent-subagents](./agent-subagents.ts)), and for the same reason. A plan
 * describes the work that a tower has done; once his answer is given, he describes
 * nothing more. Keeping it would display, above the input where we type the question
 * NEXT, a checklist which talks about the previous one - and its last state lets
 * also believe that it is still moving forward. As long as the agent has not rested or
 * rechecked a plan in the new turn, there is nothing to show.
 *
 * Only the PARENT can place a plan: `update_plan` is a control tool,
 * removed from subagents (`SUBAGENT_FORBIDDEN_TOOLS`). Their events, for their part, do not
 * close to the parent's turn — a daughter's summary is not hers.
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
