import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecurrenceCadence, nextDueDateISO, seriesIdOf } from "@/lib/recurrence";
import { createIssueForProject } from "@/lib/server/create-issue";
import { insertEvents } from "@/lib/server/issue-events";

/**
 * Le cœur des tickets récurrents (MIN-136) : un ticket qui passe en `done`
 * engendre son successeur, en `backlog`, à l'échéance décalée d'une cadence.
 *
 * L'invariant tenu ici : UN SEUL ticket vivant porte une récurrence donnée. La
 * cadence est d'abord RETIRÉE du ticket terminé par un compare-and-swap
 * (`where recurrence is not null`), et seul celui qui gagne ce swap crée
 * l'occurrence. Deux conséquences, toutes deux voulues :
 *
 * - deux écritures concurrentes (édition groupée qui rejoue, webhook redélivré)
 *   ne peuvent pas créer deux occurrences ;
 * - un `done → todo → done` ne recrée rien : la récurrence a déménagé sur
 *   l'occurrence suivante, le ticket rouvert n'est plus qu'un ticket ordinaire.
 *
 * Appelé depuis les effets différés de lib/server/update-issue.ts — le seul
 * chemin d'écriture du statut (UI, MCP, Numo, agent, synchro de dépôt).
 */
export async function spawnNextOccurrence({
  service,
  completed,
  actorId,
  projectName = null,
}: {
  service: SupabaseClient;
  /** La ligne du ticket terminé, telle que update-issue l'a chargée AVANT la
      mise à jour (elle porte encore sa récurrence). */
  completed: Record<string, unknown>;
  /** Qui a coché le ticket : auteur de l'occurrence suivante et de son
      événement de création — c'est bien son geste qui l'a fait naître. */
  actorId: string;
  projectName?: string | null;
}): Promise<void> {
  const cadence = completed.recurrence;
  if (!isRecurrenceCadence(cadence)) return;
  const issueId = completed.id as string;

  // Compare-and-swap : qui remet la cadence à null crée l'occurrence.
  const { data: claimed, error: claimError } = await service
    .from("issues")
    .update({ recurrence: null })
    .eq("id", issueId)
    .not("recurrence", "is", null)
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("[recurrence] claim failed:", claimError.message);
    return;
  }
  if (!claimed) return; // quelqu'un d'autre a déjà créé l'occurrence

  // L'échéance donne le rythme, pas la date de clôture : une revue du lundi
  // cochée le mercredi retombe sur le lundi suivant. Sans échéance (ligne
  // écrite avant la règle « une cadence exige une date »), la série s'arrête —
  // la cadence vient d'être retirée, il n'y a rien à replanifier.
  const due = nextDueDateISO(completed.due_date as string | null, cadence);
  if (!due) {
    console.error("[recurrence] no due date to schedule from, series stopped:", issueId);
    return;
  }

  const { data: categoryRows } = await service
    .from("issue_categories")
    .select("category_id")
    .eq("issue_id", issueId);

  // Ce qui se transmet : de quoi refaire LE MÊME travail. Ni le plan (le
  // journal d'UNE occurrence), ni le parent (l'occurrence suivante n'est pas
  // un sous-ticket du même chantier), ni les pièces jointes ou commentaires.
  const result = await createIssueForProject({
    projectId: completed.project_id as string,
    projectName,
    actorId,
    input: {
      title: completed.title,
      description: completed.description ?? null,
      status: "backlog",
      priority: completed.priority,
      effort: completed.effort ?? null,
      assignee_id: completed.assignee_id ?? null,
      objective_id: completed.objective_id ?? null,
      due_date: due,
      recurrence: cadence,
      category_ids: (categoryRows ?? []).map((c) => c.category_id as string),
    },
    recurrenceSeriesId: seriesIdOf({
      id: issueId,
      recurrence_series_id: completed.recurrence_series_id as string | null,
    }),
  });

  if (!result.ok) {
    // Limite d'issues du plan atteinte, base indisponible… La cadence a déjà
    // été retirée : la série s'arrête là plutôt que de boucler à chaque
    // clôture. Le ticket terminé garde son `recurrence_series_id`, donc la
    // récurrence reste reposable à la main sur le prochain ticket.
    console.error(
      "[recurrence] next occurrence failed:",
      result.rawMessage ?? result.errorKey
    );
    return;
  }

  // La trace côté ticket terminé : sans elle, cocher un ticket ferait
  // apparaître un ticket ailleurs sans que rien ne le dise.
  await insertEvents(service, [
    {
      issue_id: issueId,
      actor_id: actorId,
      type: "recurrence_spawned",
      from_value: cadence,
      to_value: result.issue.id as string,
    },
  ]);
}
