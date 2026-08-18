// PUR matching (without DB, without import server-only) between the steps of the
// agent run-scoped checklist (tool update_plan) and plan tasks
// implementation of the issue. Isolated here to be testable in node/vitest.
// Base access + writing lives in plan-sync.ts (server-only).

import type { PlanTaskState } from "@/lib/plan";

export interface AgentPlanStep {
  step: string;
  status: PlanTaskState;
}

/** A task from the outcome plan, reduced to what the pairing needs. */
export interface MatchableTask {
  /** Index (0-based) of the task in the plan — identity for the toggle. */
  index: number;
  text: string;
  state: PlanTaskState;
}

export interface PlanStateChange {
  /** Index of the outcome plan task to switch. */
  index: number;
  state: PlanTaskState;
}

/**
 * Normalizes a task label for matching: removes a possible residual list/checkbox marker
 * at the head, reduces internal spaces to a single space,
 * trim, lower case. Gives a tolerant equality key (case/spaces) between a
 * agent step and an outcome plan task.
 */
export function normalizeTaskText(text: string): string {
  return text
    .replace(/^\s*[-*+]\s+(?:\[[ ~xX-]\]\s*)?/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Calculates, for each step of the agent, the task of the outcome plan whose label
 * NORMALIZED corresponds, and the target state WHEN IT DIFFERS from the current state.
 * - Matching by normalized text; duplicate labels are consumed in
 * order of appearance (a task is only matched once).
 * - Step status maps 1:1 to box state (pending→pending, …).
 * - ONLY returns true toggles: no match or state already
 * correct → nothing (no-op). Never touch TEXT — only state.
 */
export function planStateChanges(
  tasks: MatchableTask[],
  steps: AgentPlanStep[]
): PlanStateChange[] {
  // Normalized text → queue of positions (in `tasks`) sharing this text.
  const byText = new Map<string, number[]>();
  tasks.forEach((task, pos) => {
    const key = normalizeTaskText(task.text);
    if (!key) return;
    const bucket = byText.get(key);
    if (bucket) bucket.push(pos);
    else byText.set(key, [pos]);
  });

  const changes: PlanStateChange[] = [];
  const consumed = new Set<number>();
  for (const step of steps) {
    const key = normalizeTaskText(step.step);
    if (!key) continue;
    const bucket = byText.get(key);
    if (!bucket) continue;
    const pos = bucket.find((p) => !consumed.has(p));
    if (pos === undefined) continue;
    consumed.add(pos);
    const task = tasks[pos];
    if (task.state !== step.status) {
      changes.push({ index: task.index, state: step.status });
    }
  }
  return changes;
}
