import type { CreateIssueInput, Issue } from "./types";

/**
 * Construit une issue « optimiste » à partir de l'input de création, insérée
 * dans le cache immédiatement pour que la carte apparaisse sans attendre le POST
 * (MIN-40). Réconciliée avec la ligne serveur au succès, retirée à l'échec.
 *
 * L'id porte le préfixe `temp-` (voir {@link isOptimisticIssueId}) : les autres
 * clients ne le voient jamais, et le realtime remplace la carte par la vraie
 * ligne. Le `number` est une estimation (max + 1) recalée au succès — la valeur
 * définitive vient du compteur atomique côté serveur.
 */
export function buildOptimisticIssue(
  input: CreateIssueInput,
  projectId: string,
  userId: string | null,
  existing: Issue[]
): Issue {
  const now = new Date().toISOString();
  const nextNumber = existing.reduce((m, i) => Math.max(m, i.number), 0) + 1;
  const status = input.status ?? "backlog"; // même défaut que la colonne DB
  return {
    id: `temp-${crypto.randomUUID()}`,
    project_id: projectId,
    number: nextNumber,
    title: input.title,
    description: input.description ?? null,
    plan: input.plan ?? null,
    status,
    priority: input.priority ?? "none",
    effort: input.effort ?? null,
    assignee_id: input.assignee_id ?? null,
    objective_id: input.objective_id ?? null,
    parent_id: input.parent_id ?? null,
    duplicate_of_id: null,
    due_date: input.due_date ?? null,
    recurrence: input.recurrence ?? null,
    // Posée par le serveur à la première activation (elle vaut l'id de la ligne,
    // qu'on n'a pas encore) : la carte optimiste s'en passe.
    recurrence_series_id: null,
    position: Date.now(),
    created_by: userId,
    integration_id: null,
    created_at: now,
    updated_at: now,
    completed_at: status === "done" ? now : null,
    cycle_id: null,
    category_ids: input.category_ids ?? [],
  };
}

/** Une issue encore en attente de confirmation serveur (id `temp-…`). */
export function isOptimisticIssueId(id: string): boolean {
  return id.startsWith("temp-");
}
