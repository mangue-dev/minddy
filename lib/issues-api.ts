"use client";

import { trackEvent } from "./analytics";
import { lengthBucket } from "./analytics-sanitize";
import { rememberCreateProject } from "./last-create-project";
import { applyPendingIssues } from "./optimistic/issue-writes";
import type {
  CreateIssueInput,
  Issue,
  IssueUpdateInput,
  RecurringIssue,
} from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  if (data == null) throw new Error("Empty response");
  return data as T;
}

/** `signal` : celui que react-query fournit à sa `queryFn` — un refetch annulé
    lâche vraiment sa requête au lieu de la laisser courir et répondre en retard
    (MIN-156). */
export async function fetchIssuesApi(
  projectId: string,
  signal?: AbortSignal
): Promise<Issue[]> {
  return parseJson<Issue[]>(
    await fetch(`/api/projects/${projectId}/issues`, { signal })
  );
}

/**
 * La `queryFn` de `["issues", projectId]`, partagée par TOUS ses observateurs :
 * le board du projet, les cartes du tableau de bord, l'entête et le
 * préchargement au survol. Une seule fonction pour une seule clé — sans quoi le
 * dernier observateur monté imposerait sa lecture, et une lecture qui saute
 * l'overlay ramène le bug (MIN-156).
 *
 * Elle retient l'instant du DÉPART de la requête et fait traverser la réponse au
 * registre d'écritures en attente : une réponse partie avant une écriture ne
 * peut plus la défaire, quel que soit son ordre d'arrivée.
 */
export function issuesQueryFn(projectId: string) {
  return async ({ signal }: { signal?: AbortSignal } = {}): Promise<Issue[]> => {
    const startedAt = Date.now();
    return applyPendingIssues(await fetchIssuesApi(projectId, signal), startedAt);
  };
}

/** Les récurrences actives d'un projet (MIN-136) — un ticket vivant par série,
    lu par l'onglet « Récurrences » de ses paramètres. */
export async function fetchRecurrencesApi(
  projectId: string
): Promise<RecurringIssue[]> {
  return parseJson<RecurringIssue[]>(
    await fetch(`/api/projects/${projectId}/recurrences`)
  );
}

/** One issue, in full. Used where only a light row is at hand — the command
    palette's cross-project index (MIN-91) carries no description or plan, which
    « copier le prompt » needs, so it fetches the ticket on demand. */
export async function fetchIssueApi(issueId: string): Promise<Issue> {
  return parseJson<Issue>(await fetch(`/api/issues/${issueId}`));
}

export async function createIssueApi(
  projectId: string,
  input: CreateIssueInput
): Promise<Issue> {
  const issue = await parseJson<Issue>(
    await fetch(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  // Toutes les créations côté client passent par ici (tableau de projet, board
  // agrégé, dialog global, palette, annulation) : c'est donc le seul endroit à
  // instrumenter pour mémoriser le dernier projet où un ticket a été créé, qui
  // sert de projet par défaut au dialog quand la route n'en désigne aucun. Après
  // le succès seulement — une création refusée ne déplace pas le défaut.
  rememberCreateProject(projectId);
  return issue;
}

/** Contexte analytics facultatif — la surface d'où part l'édition (MIN-78). */
export interface IssueMutationMeta {
  /** « side_panel », « kanban », « palette », « context_menu », « bulk »… */
  surface?: string;
  /** État précédent, quand l'appelant le connaît (mise à jour optimiste). */
  previousStatus?: string | null;
}

/**
 * Traduit un patch en événements analytics (MIN-78).
 *
 * C'est ici, et pas dans chaque composant, parce que TOUTES les éditions de
 * ticket convergent vers `updateIssueApi` : panneau latéral, menu contextuel,
 * glisser-déposer du kanban, palette, actions groupées, annulation. Instrumenter
 * le goulot d'étranglement plutôt que la douzaine d'appelants garantit qu'aucun
 * chemin n'est oublié — et qu'un futur appelant est couvert d'office.
 *
 * Seules des MÉTADONNÉES partent : jamais le titre ni la description, seulement
 * leur modification et la tranche de longueur.
 */
function trackIssueUpdate(updates: IssueUpdateInput, meta?: IssueMutationMeta): void {
  const surface = meta?.surface ?? "unknown";
  const patch = updates as Record<string, unknown>;

  if (patch.status !== undefined) {
    trackEvent("issue_status_changed", {
      from: meta?.previousStatus ?? null,
      to: String(patch.status),
      surface,
    });
  }
  if (patch.priority !== undefined) {
    trackEvent("issue_priority_changed", { to: String(patch.priority), surface });
  }
  if (patch.assignee_id !== undefined) {
    trackEvent("issue_assignee_changed", {
      assigned: patch.assignee_id !== null,
      surface,
    });
  }
  if (patch.effort !== undefined) {
    trackEvent("issue_effort_changed", { to: String(patch.effort ?? "none") });
  }
  if (patch.due_date !== undefined) {
    trackEvent("issue_due_date_changed", { cleared: patch.due_date === null });
  }
  if (patch.cycle_id !== undefined && patch.status !== "triage") {
    // Le cycle est un champ du ticket, mais l'action utilisateur est « ajouter
    // à / retirer de mon cycle » — c'est sous ce nom qu'on veut la lire. D'où
    // l'exception : un passage en triage sort le ticket du cycle (MIN-32), mais
    // c'est une conséquence, pas le geste — le compter fausserait la mesure.
    trackEvent(patch.cycle_id === null ? "cycle_issue_removed" : "cycle_issue_added", {
      surface,
    });
  }
  if (patch.duplicate_of_id !== undefined && patch.duplicate_of_id !== null) {
    trackEvent("issue_relation_added", { relation: "duplicate" });
  }
  if (patch.objective_id !== undefined) {
    trackEvent("issue_objective_changed", { assigned: patch.objective_id !== null });
  }
  if (patch.title !== undefined) trackEvent("issue_title_edited", {});
  if (patch.description !== undefined) {
    trackEvent("issue_description_edited", {
      length_bucket: lengthBucket(
        typeof patch.description === "string" ? patch.description : null
      ),
    });
  }
  if (patch.plan !== undefined) {
    trackEvent("issue_plan_edited", {
      task_count:
        typeof patch.plan === "string"
          ? (patch.plan.match(/^\s*[-*]\s*\[[ x~-]\]/gim)?.length ?? 0)
          : 0,
    });
  }
  if (patch.parent_id !== undefined) {
    trackEvent("issue_relation_added", { relation: "parent" });
  }
}

export async function updateIssueApi(
  issueId: string,
  updates: IssueUpdateInput,
  meta?: IssueMutationMeta
): Promise<Issue> {
  const issue = parseJson<Issue>(
    await fetch(`/api/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
  // Tracké seulement après un aller-retour réussi — une édition rejetée par le
  // serveur (quota, permission) n'est pas une édition.
  void issue.then(
    () => trackIssueUpdate(updates, meta),
    () => {}
  );
  return issue;
}

export async function deleteIssueApi(
  issueId: string,
  meta?: IssueMutationMeta
): Promise<void> {
  const response = await fetch(`/api/issues/${issueId}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
  trackEvent("issue_deleted", { surface: meta?.surface ?? "unknown" });
}
