import type { CreateIssueInput, Issue } from "./types";

/**
 * Construit une issue « optimiste » à partir de l'input de création, insérée
 * dans le cache immédiatement pour que la carte apparaisse sans attendre le POST
 * (MIN-40). Réconciliée avec la ligne serveur au succès, retirée à l'échec.
 *
 * **C'est le client qui NOMME la ligne** : l'id tiré ici part avec la création
 * (`CreateIssueInput.id`) et devient la clé primaire en base. Sans ça la carte
 * s'affichait en double une seconde : le trigger diffuse l'INSERT au commit,
 * bien avant que le POST ne réponde (il lui reste les pièces jointes, les
 * catégories et Smart Assign à faire), et le pont temps réel ne pouvait pas
 * reconnaître cette diffusion comme la nôtre — le registre d'écritures en
 * attente ne connaissait que l'id optimiste, la ligne diffusée en portait un
 * autre. Il l'adoptait donc comme la ligne d'un tiers, à côté de la carte
 * optimiste ; puis le retour du POST posait la ligne serveur SUR la carte, deux
 * entrées de même id que seul un refetch recollait (rapide sur le board d'un
 * projet, plusieurs secondes sur `/all`, d'où le doublon qui « restait »).
 * Même id des deux côtés, `issueWrites.wasJustWritten` reconnaît l'écho et le
 * pont le laisse passer, exactement comme pour une édition.
 *
 * Le `number`, lui, reste une estimation (max + 1 **dans ce projet**) recalée au
 * succès — la valeur définitive vient du compteur atomique côté serveur.
 */
export function buildOptimisticIssue(
  input: CreateIssueInput,
  projectId: string,
  userId: string | null,
  existing: Issue[]
): Issue {
  const now = new Date().toISOString();
  const nextNumber =
    existing.reduce(
      (m, i) => (i.project_id === projectId ? Math.max(m, i.number) : m),
      0
    ) + 1;
  const status = input.status ?? "backlog"; // même défaut que la colonne DB
  return {
    id: crypto.randomUUID(),
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
    // Le compte de pièces jointes est un AGRÉGAT : ni la réponse du POST ni la
    // ligne diffusée ne le portent, seul le GET du board le calcule. On le pose
    // donc ici — à la création, les ressources du ticket sont exactement celles
    // qu'on envoie —, sans quoi la pastille manquerait jusqu'au prochain refetch.
    resource_count:
      (input.resources?.length ?? 0) + (input.copy_resources?.length ?? 0),
  };
}
