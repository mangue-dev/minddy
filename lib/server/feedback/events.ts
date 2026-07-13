import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertEvents,
  stampIntegration,
  stampViaAssistant,
  type EventRow,
} from "@/lib/server/issue-events";
import type { FeedbackPostSource } from "@/lib/feedback/types";

/**
 * Journal d'activité du feedback (MIN-57) — le pendant de issue-events pour les
 * posts de feedback. Les rows vivent dans la MÊME table `issue_events`
 * (polymorphe issue / objectif / feedback_post) et passent par le même
 * `insertEvents` ; ces helpers ne font que construire les EventRow feedback et
 * les attribuer correctement (membre, board, intégration, IA).
 *
 * Toutes les écritures sont best-effort et hors chemin critique : un échec de
 * journalisation ne doit jamais faire échouer la mutation qui l'a déclenchée
 * (insertEvents avale déjà ses erreurs).
 */

const s = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** Champs du post suivis avec from/to (le miroir de buildFieldChangeEvents). */
export function buildFeedbackFieldChangeEvents(
  postId: string,
  actorId: string | null,
  before: Record<string, unknown>,
  updates: Record<string, unknown>
): EventRow[] {
  const events: EventRow[] = [];

  if ("title" in updates && updates.title !== before.title) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "title",
      from_value: s(before.title),
      to_value: s(updates.title),
    });
  }
  // Corps : comme une description, on n'enregistre que le fait qu'il a changé.
  if ("body" in updates && (updates.body ?? "") !== (before.body ?? "")) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "body",
    });
  }
  if ("status" in updates && (updates.status ?? null) !== (before.status ?? null)) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "status",
      from_value: s(before.status),
      to_value: s(updates.status),
    });
  }
  // Réponse d'équipe : on ne journalise pas le texte, seulement l'action
  // (publiée / retirée) — comme le corps, la valeur n'a pas à fuiter dans le fil.
  if (
    "team_response" in updates &&
    (updates.team_response ?? null) !== (before.team_response ?? null)
  ) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "team_response",
      to_value: updates.team_response ? "set" : "cleared",
    });
  }
  return events;
}

/** Événement « créé » — attribué au membre (saisie interne), à l'intégration
    (canal API) ou au board (soumission publique, acteur anonyme). Le canal est
    porté par `field` pour la phrase du fil. */
export async function emitFeedbackCreated(
  service: SupabaseClient,
  params: {
    postId: string;
    source: FeedbackPostSource;
    createdByMember?: string | null;
    integrationId?: string | null;
  }
): Promise<void> {
  const row: EventRow = {
    feedback_post_id: params.postId,
    actor_id: params.source === "internal" ? params.createdByMember ?? null : null,
    type: "created",
    field: params.source,
  };
  await insertEvents(
    service,
    stampIntegration([row], params.source === "api" ? params.integrationId : null)
  );
}

/** Événements de changement de champ (titre / corps / statut / réponse). */
export async function emitFeedbackFieldChanges(
  service: SupabaseClient,
  params: {
    postId: string;
    actorId: string | null;
    before: Record<string, unknown>;
    updates: Record<string, unknown>;
  }
): Promise<void> {
  await insertEvents(
    service,
    buildFeedbackFieldChangeEvents(
      params.postId,
      params.actorId,
      params.before,
      params.updates
    )
  );
}

/** Promotion en issue (to_value = id de l'issue créée). */
export async function emitFeedbackPromoted(
  service: SupabaseClient,
  params: { postId: string; actorId: string | null; issueId: string }
): Promise<void> {
  await insertEvents(service, [
    {
      feedback_post_id: params.postId,
      actor_id: params.actorId,
      type: "promoted",
      to_value: params.issueId,
    },
  ]);
}

/** Lien vers une issue existante (to_value = id de l'issue). */
export async function emitFeedbackLinked(
  service: SupabaseClient,
  params: { postId: string; actorId: string | null; issueId: string }
): Promise<void> {
  await insertEvents(service, [
    {
      feedback_post_id: params.postId,
      actor_id: params.actorId,
      type: "linked",
      to_value: params.issueId,
    },
  ]);
}

/** Détachement de l'issue liée (from_value = id de l'issue détachée). */
export async function emitFeedbackUnlinked(
  service: SupabaseClient,
  params: { postId: string; actorId: string | null; issueId: string | null }
): Promise<void> {
  await insertEvents(service, [
    {
      feedback_post_id: params.postId,
      actor_id: params.actorId,
      type: "unlinked",
      from_value: params.issueId,
    },
  ]);
}

/** Fusion reçue sur le post canonique (to_value = titre du doublon absorbé).
    Une fusion IA est attribuée à Numo dans le fil (via_assistant). */
export async function emitFeedbackMerged(
  service: SupabaseClient,
  params: {
    canonicalPostId: string;
    actorId: string | null;
    dupTitle: string;
    performedBy: "ai" | "team";
    undone?: boolean;
  }
): Promise<void> {
  const row: EventRow = {
    feedback_post_id: params.canonicalPostId,
    actor_id: params.actorId,
    type: params.undone ? "merge_undone" : "merged",
    to_value: params.dupTitle,
  };
  await insertEvents(
    service,
    stampViaAssistant([row], params.performedBy === "ai")
  );
}
