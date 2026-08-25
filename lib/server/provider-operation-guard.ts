import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

export type ProviderOperationReservation =
  | { state: "reserved"; retryAfter: 0 }
  | { state: "deduplicated" | "quota_exceeded"; retryAfter: number }
  | { state: "unavailable"; retryAfter: 0 };

/**
 * Atomically reserves one external-provider operation. The database owns both
 * the sliding-window count and the optional resource lease, so the decision is
 * shared by every application instance.
 */
export async function reserveProviderOperation(input: {
  actorId: string;
  provider: string;
  operation: string;
  resourceKey: string;
  limit: number;
  windowSeconds: number;
  dedupeSeconds?: number;
}): Promise<ProviderOperationReservation> {
  const { data, error } = await getServiceClient().rpc("reserve_provider_operation", {
    p_actor_id: input.actorId,
    p_provider: input.provider,
    p_operation: input.operation,
    p_resource_key: input.resourceKey,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
    p_dedupe_seconds: input.dedupeSeconds ?? 0,
  });
  if (error) {
    console.error("[provider-operation-guard] reservation failed:", error.message);
    return { state: "unavailable", retryAfter: 0 };
  }

  const result = data as { state?: unknown; retry_after?: unknown } | null;
  if (result?.state === "reserved") return { state: "reserved", retryAfter: 0 };
  if (
    (result?.state === "deduplicated" || result?.state === "quota_exceeded") &&
    typeof result.retry_after === "number" &&
    Number.isFinite(result.retry_after) &&
    result.retry_after > 0
  ) {
    return {
      state: result.state,
      retryAfter: Math.ceil(result.retry_after),
    };
  }

  console.error("[provider-operation-guard] invalid reservation response");
  return { state: "unavailable", retryAfter: 0 };
}
