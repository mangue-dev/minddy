"use client";

import { createSerialQueue } from "./serial-queue";
import type { Conversation } from "./assistant-types";

/** Toutes les conversations de l'utilisateur, la plus récente d'abord, projets
 *  confondus — l'historique de Numo ne filtre plus par portée (MIN-353). */
export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch("/api/assistant/conversations");
  if (!res.ok) return [];
  return res.json();
}

export async function deleteConversation(
  conversationId: string
): Promise<boolean> {
  const res = await fetch(
    `/api/assistant/conversations?id=${encodeURIComponent(conversationId)}`,
    { method: "DELETE" }
  );
  return res.ok;
}

/** La conversation ouverte, et sa portée (MIN-353). Le pointeur vit en base :
 *  il survit au rechargement, à l'onglet d'à côté et à l'app de bureau. */
export interface ActiveConversationRef {
  conversationId: string | null;
  projectId: string | null;
}

export async function fetchActiveConversation(): Promise<ActiveConversationRef> {
  const res = await fetch("/api/assistant/active-conversation");
  if (!res.ok) return { conversationId: null, projectId: null };
  return res.json();
}

/**
 * Les écritures du pointeur, BOUT À BOUT.
 *
 * Elles se suivent de près et s'annulent l'une l'autre : « nouvelle
 * conversation » efface, le premier message écrit. Lancées en parallèle, rien ne
 * garantit qu'elles arrivent dans l'ordre où elles sont parties — un DELETE
 * traité après le PUT laisse la base sans pointeur alors que le fil est vivant.
 * Et ignorer la réponse d'une écriture périmée n'y changerait rien : le serveur
 * l'a déjà appliquée. Seul l'ordre d'ÉMISSION se contrôle, d'où la file.
 */
const pointerWrites = createSerialQueue();

/** `null` efface le pointeur (« nouvelle conversation »). Best-effort : perdre
 *  l'écriture ne coûte qu'une reprise ratée, jamais un message. */
export function setActiveConversation(
  conversationId: string | null
): Promise<void> {
  return pointerWrites(async () => {
    try {
      await fetch("/api/assistant/active-conversation", {
        method: conversationId ? "PUT" : "DELETE",
        ...(conversationId
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversationId }),
            }
          : {}),
      });
    } catch {
      // Réseau coupé — le pointeur se remettra à jour au prochain message.
    }
  });
}
