import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Anti-replay of forge webhook deliveries (MIN-333).
 *
 * Both forges number their deliveries — `X-GitHub-Delivery`,
 * `X-Gitlab-Event-UUID` — and re-deliver when the receiver has failed. Without guard,
 * the same payload could be replayed as many times as wanted by who
 * had captured it, and each replay did the work again: status sync,
 * notifications, Numo pass on a mention.
 *
 * The guard is an INSERT: the primary key `(provider, delivery_id)` DOES it,
 * like `stripe_webhook_events` already does for Stripe. No prior SELECT
 * — two competing deliveries would both pass it.
 *
 * Two fallbacks assumed, in the same direction (process rather than lose):
 * · no delivery identifier in the header → we process. A charge without
 * identifier is not deduplicable, and refusing would cut off the receivers
 * exercised by hand.
 * · the base responds to an error which is NOT a duplicate (23505) → we process. The
 * replay is a narrow door; losing a forge event, no.
 *
 * To be called AFTER the secret check: otherwise anyone could
 * mark a delivery as seen in advance, and silence the real event.
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
