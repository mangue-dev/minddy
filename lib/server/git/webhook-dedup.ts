import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Anti-rejeu des livraisons de webhook de forge (MIN-333).
 *
 * Les deux forges numérotent leurs livraisons — `X-GitHub-Delivery`,
 * `X-Gitlab-Event-UUID` — et re-livrent quand le récepteur a échoué. Sans garde,
 * la même charge utile pouvait être rejouée autant de fois que voulu par qui
 * l'avait capturée, et chaque rejeu refaisait le travail : synchro de statut,
 * notifications, passe de Numo sur une mention.
 *
 * La garde est un INSERT : la clé primaire `(provider, delivery_id)` la FAIT,
 * comme `stripe_webhook_events` le fait déjà pour Stripe. Pas de SELECT
 * préalable — deux livraisons concurrentes le passeraient toutes les deux.
 *
 * Deux replis assumés, dans le même sens (traiter plutôt que perdre) :
 *  · pas d'identifiant de livraison dans l'en-tête → on traite. Une charge sans
 *    identifiant n'est pas dédoublonnable, et refuser couperait les récepteurs
 *    exercés à la main.
 *  · la base répond une erreur qui n'est PAS un doublon (23505) → on traite. Le
 *    rejeu est une porte étroite ; perdre un événement de la forge, non.
 *
 * À appeler APRÈS la vérification du secret : sinon n'importe qui pourrait
 * marquer d'avance une livraison comme vue, et faire taire l'événement réel.
 */
export async function isReplayedForgeDelivery(
  provider: RepoProviderId,
  deliveryId: string | null | undefined,
): Promise<boolean> {
  const id = deliveryId?.trim();
  if (!id) return false;
  const service = getServiceClient();
  const { error } = await service
    .from("forge_webhook_deliveries")
    .insert({ provider, delivery_id: id });
  if (!error) return false;
  if (error.code === "23505") return true;
  console.error("[webhook-dedup] delivery insert failed:", error.message);
  return false;
}
