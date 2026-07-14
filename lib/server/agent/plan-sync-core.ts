// Appariement PUR (sans DB, sans import server-only) entre les étapes du
// checklist run-scopé de l'agent (tool update_plan) et les tâches du plan
// d'implémentation de l'issue. Isolé ici pour être testable en node/vitest.
// L'accès base + l'écriture vivent dans plan-sync.ts (server-only).

import type { PlanTaskState } from "@/lib/plan";

export interface AgentPlanStep {
  step: string;
  status: PlanTaskState;
}

/** Une tâche du plan d'issue, réduite à ce dont l'appariement a besoin. */
export interface MatchableTask {
  /** Index (0-based) de la tâche dans le plan — identité pour la bascule. */
  index: number;
  text: string;
  state: PlanTaskState;
}

export interface PlanStateChange {
  /** Index de la tâche du plan d'issue à basculer. */
  index: number;
  state: PlanTaskState;
}

/**
 * Normalise un libellé de tâche pour l'appariement : retire un éventuel marqueur
 * de liste/checkbox résiduel en tête, réduit les espaces internes à un seul,
 * trim, casse basse. Donne une clé d'égalité tolérante (casse/espaces) entre une
 * étape de l'agent et une tâche du plan d'issue.
 */
export function normalizeTaskText(text: string): string {
  return text
    .replace(/^\s*[-*+]\s+(?:\[[ ~xX-]\]\s*)?/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Calcule, pour chaque étape de l'agent, la tâche du plan d'issue dont le libellé
 * NORMALISÉ correspond, et l'état cible LORSQU'IL DIFFÈRE de l'état courant.
 *  - Appariement par texte normalisé ; les libellés en double sont consommés dans
 *    l'ordre d'apparition (une tâche n'est appariée qu'une seule fois).
 *  - Le statut de l'étape se mappe 1:1 sur l'état de la case (pending→pending, …).
 *  - Ne renvoie QUE les vraies bascules : pas de correspondance ou état déjà
 *    correct → rien (no-op). Ne touche jamais au TEXTE — seulement à l'état.
 */
export function planStateChanges(
  tasks: MatchableTask[],
  steps: AgentPlanStep[]
): PlanStateChange[] {
  // Texte normalisé → file des positions (dans `tasks`) partageant ce texte.
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
