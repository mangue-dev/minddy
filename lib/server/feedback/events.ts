import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertEvents,
  stampIntegration,
  stampMcpKey,
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
  // La réponse d'équipe ne passe plus par ici (MIN-196) : c'est un commentaire
  // public, et le fil d'activité montre déjà les commentaires. Les lignes
  // `team_response` déjà écrites restent lisibles — voir lib/describe-event.ts.
  // Visibilité : on journalise le sens (rendu public / privé) — pas de from/to,
  // l'action se suffit à elle-même dans le fil.
  if (
    "is_public" in updates &&
    (updates.is_public ?? null) !== (before.is_public ?? null)
  ) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "is_public",
      to_value: updates.is_public ? "public" : "private",
    });
  }
  // État de publication (MIN-54) : publication d'un retour retenu, émise par un
  // override équipe. `pending` ne produit pas de phrase — c'est l'état
  // d'attente initial, sans action à raconter. Le junk, lui, ne passe plus par
  // ici : il est devenu le statut `spam`, journalisé par le bloc `status`.
  if (
    "review_state" in updates &&
    (updates.review_state ?? null) !== (before.review_state ?? null) &&
    updates.review_state !== "pending"
  ) {
    events.push({
      feedback_post_id: postId,
      actor_id: actorId,
      type: "updated",
      field: "review_state",
      to_value: s(updates.review_state),
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
    /** Attribue le changement à Numo dans le fil (via_assistant). */
    viaAssistant?: boolean;
    /** Attribue le changement à l'agent MCP (via_mcp + clé) dans le fil. */
    mcpKeyId?: string | null;
  }
): Promise<void> {
  const rows = stampMcpKey(
    stampViaAssistant(
      buildFeedbackFieldChangeEvents(
        params.postId,
        params.actorId,
        params.before,
        params.updates
      ),
      !!params.viaAssistant
    ),
    params.mcpKeyId
  );
  await insertEvents(service, rows);
}

/** Promotion en issue (to_value = id de l'issue créée). */
export async function emitFeedbackPromoted(
  service: SupabaseClient,
  params: {
    postId: string;
    actorId: string | null;
    issueId: string;
    mcpKeyId?: string | null;
  }
): Promise<void> {
  await insertEvents(
    service,
    stampMcpKey(
      [
        {
          feedback_post_id: params.postId,
          actor_id: params.actorId,
          type: "promoted",
          to_value: params.issueId,
        },
      ],
      params.mcpKeyId
    )
  );
}

/** Lien vers une issue existante (to_value = id de l'issue). */
export async function emitFeedbackLinked(
  service: SupabaseClient,
  params: {
    postId: string;
    actorId: string | null;
    issueId: string;
    mcpKeyId?: string | null;
  }
): Promise<void> {
  await insertEvents(
    service,
    stampMcpKey(
      [
        {
          feedback_post_id: params.postId,
          actor_id: params.actorId,
          type: "linked",
          to_value: params.issueId,
        },
      ],
      params.mcpKeyId
    )
  );
}

/** Détachement de l'issue liée (from_value = id de l'issue détachée). */
export async function emitFeedbackUnlinked(
  service: SupabaseClient,
  params: {
    postId: string;
    actorId: string | null;
    issueId: string | null;
    mcpKeyId?: string | null;
  }
): Promise<void> {
  await insertEvents(
    service,
    stampMcpKey(
      [
        {
          feedback_post_id: params.postId,
          actor_id: params.actorId,
          type: "unlinked",
          from_value: params.issueId,
        },
      ],
      params.mcpKeyId
    )
  );
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
