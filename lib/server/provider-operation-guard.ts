import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { providerResourceIndex,
  shouldIndexProviderResource } from "@/lib/server/encryption/provider-resource-key";

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
  let data: unknown;
  let error: { message: string } | null;
  try {
    const service = getServiceClient();
    const protectedKey = await shouldIndexProviderResource(service);
    const response = protectedKey
      ? await service.rpc("reserve_provider_operation_protected", {
          p_actor_id: input.actorId, p_provider: input.provider,
          p_operation: input.operation,
          p_legacy_resource_key: input.resourceKey,
          p_indexed_resource_key: await providerResourceIndex(input.resourceKey),
          p_limit: input.limit, p_window_seconds: input.windowSeconds,
          p_dedupe_seconds: input.dedupeSeconds ?? 0,
        })
      : await service.rpc("reserve_provider_operation", {
          p_actor_id: input.actorId, p_provider: input.provider,
          p_operation: input.operation, p_resource_key: input.resourceKey,
          p_limit: input.limit, p_window_seconds: input.windowSeconds,
          p_dedupe_seconds: input.dedupeSeconds ?? 0,
        });
    data = response.data;
    error = response.error;
  } catch {
    console.error("[provider-operation-guard] reservation unavailable");
    return { state: "unavailable", retryAfter: 0 };
  }
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

/** Releases an active resource lease while retaining its row for window quotas. */
export async function releaseProviderOperation(input: {
  actorId: string;
  provider: string;
  operation: string;
  resourceKey: string;
}): Promise<boolean> {
  let data: unknown;
  let error: { message: string } | null;
  try {
    const service = getServiceClient();
    const protectedKey = await shouldIndexProviderResource(service);
    const response = protectedKey
      ? await service.rpc("release_provider_operation_protected", {
          p_actor_id: input.actorId, p_provider: input.provider,
          p_operation: input.operation,
          p_legacy_resource_key: input.resourceKey,
          p_indexed_resource_key: await providerResourceIndex(input.resourceKey),
        })
      : await service.rpc("release_provider_operation", {
          p_actor_id: input.actorId, p_provider: input.provider,
          p_operation: input.operation, p_resource_key: input.resourceKey,
        });
    data = response.data;
    error = response.error;
  } catch {
    console.error("[provider-operation-guard] lease release unavailable");
    return false;
  }
  if (error) {
    console.error("[provider-operation-guard] lease release failed:", error.message);
    return false;
  }
  return data === true;
}
