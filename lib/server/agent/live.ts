import "server-only";

import type { AgentLiveEdit } from "./exec-tool";

/**
 * Diffusion EN DIRECT d'une session de l'agent de code, sur le topic privé
 * `agent-run:{runId}` (migration 20260908090000_agent_live_stream).
 *
 * Deux messages, tous deux ÉPHÉMÈRES — rien n'est écrit en base par ce module :
 *
 *   `stream` — le texte du round en cours, ré-émis pendant que le modèle écrit.
 *              C'est ce qui donne au fil de l'agent le rendu streamé de Numo.
 *   `event`  — la ligne `agent_run_events` qui vient d'être insérée, poussée
 *              telle quelle (appendEvent) pour que le fil l'affiche tout de
 *              suite au lieu d'attendre son poll.
 *
 * On tape l'endpoint HTTP de Realtime plutôt que d'ouvrir un websocket : la
 * boucle tourne dans une fonction serverless qui peut être coupée à tout moment,
 * et un POST sans état s'y prête mieux qu'une connexion à maintenir. La clé de
 * service autorise la diffusion sur un topic privé.
 *
 * TOUT est best-effort : une diffusion ratée ne doit jamais faire échouer un run
 * (le polling du fil rattrape ce qui manque).
 */

export function agentRunTopic(runId: string): string {
  return `agent-run:${runId}`;
}

/** Charge utile du direct : l'état COMPLET du round en cours, pas un delta —
 *  un message perdu se rattrape donc au suivant, sans trou dans le texte. */
export interface AgentLiveStream {
  /** Réponse du modèle telle qu'écrite jusqu'ici. */
  text: string;
  /** Nombre d'appels d'outils déjà amorcés dans ce round : >0 ⇒ ce texte est de
   *  la narration (le tour continue), 0 ⇒ c'est peut-être la réponse finale. */
  tools: number;
  /** Le modèle raisonne EN CE MOMENT (MIN-122) → indicateur + compteur dans le fil.
   *  Le TEXTE du raisonnement ne passe pas par ici : il n'est pas streamé, il est
   *  persisté replié en fin de round. */
  reasoningActive: boolean;
  /** Millisecondes de réflexion accumulées dans ce round (alimente le compteur). */
  reasoningMs: number;
  /** Horodatage d'émission (ms). Le client jette ce qui arrive dans le désordre.
   *  Un compteur ne conviendrait pas : un run repris repart d'une autre
   *  invocation, donc d'un compteur remis à zéro. */
  at: number;
  /** Fichiers touchés jusqu'ici par le tour, provisoires : portés par CHAQUE
   *  charge, sans quoi le fil les efface dès la charge suivante. */
  files?: AgentLiveEdit[];
  /** La liste a été bornée à `CHANGED_FILES_CAP`. */
  filesTruncated?: boolean;
}

/**
 * Envoi brut sur un topic privé. Sorti de la fonction ci-dessous pour servir
 * aussi la review d'une PR (`pr-review:{id}`), qui diffuse la même paire
 * `stream`/`event` sur son propre topic : le transport ne dépend pas de ce qui
 * est diffusé, seul le topic change.
 *
 * `changed` est le troisième, pour le direct d'une pull request
 * (`pull-request:{id}`, MIN-161) : il ne transporte pas de contenu, seulement
 * les parties qui ont bougé — le contenu d'une PR se lit chez la forge, avec le
 * token de CELUI QUI REGARDE (cf. lib/pr-live.ts).
 */
export async function broadcastToTopic(
  topic: string,
  event: "stream" | "event" | "changed",
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: true }],
      }),
    });
  } catch {
    // Le fil poll toutes les 2 s : au pire, l'écran a un temps de retard.
  }
}

async function broadcast(
  runId: string,
  event: "stream" | "event",
  payload: Record<string, unknown>,
): Promise<void> {
  await broadcastToTopic(agentRunTopic(runId), event, payload);
}

/** Texte du round en cours. Appelé à la cadence du stream LLM (throttlé en amont). */
export function broadcastRunStream(runId: string, live: AgentLiveStream): void {
  void broadcast(runId, "stream", { ...live });
}

/** Ligne d'event fraîchement insérée, poussée telle quelle au fil ouvert. */
export function broadcastRunEvent(
  runId: string,
  row: { id: string; seq: number; type: string; payload: unknown; created_at: string },
): void {
  void broadcast(runId, "event", { row });
}
