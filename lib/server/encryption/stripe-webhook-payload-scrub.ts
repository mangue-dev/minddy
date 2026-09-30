import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";

/** Remove forensic event bodies in bounded, idempotent batches. */
export async function scrubStripeWebhookPayloadsBatch(
  limit = 100, signal?: AbortSignal,
) {
  if (!isContentEncryptionEnabled())
    throw new Error("Stripe webhook payload scrub is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
    throw new Error("Invalid Stripe webhook scrub batch size");
  const result = { scanned: 0, scrubbed: 0, conflicted: 0,
    failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("stripe_webhook_events")
    .select("stripe_event_id")
    .not("payload", "is", null)
    .order("payload_scrub_attempted_at", { ascending: true,
      nullsFirst: true })
    .order("stripe_event_id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Stripe webhook payloads");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    const now = new Date().toISOString();
    try {
      const { data: saved, error: writeError } = await service
        .from("stripe_webhook_events")
        .update({ payload: null, payload_scrub_attempted_at: now })
        .eq("stripe_event_id", row.stripe_event_id)
        .not("payload", "is", null)
        .select("stripe_event_id").maybeSingle();
      if (writeError) throw new Error("Unable to scrub Stripe webhook payload");
      if (saved) result.scrubbed++;
      else result.conflicted++;
    } catch {
      result.failed++;
      await service.from("stripe_webhook_events")
        .update({ payload_scrub_attempted_at: now })
        .eq("stripe_event_id", row.stripe_event_id);
    }
  }
  return result;
}
