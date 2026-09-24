import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";
import { decodeSurfaceDestination, encodeSurfaceDestination,
  isEncryptedSurfaceDestination, surfaceDestinationState,
  type StoredSurfaceDestination } from "@/lib/server/numo/surface-destination-content";

/** Convert or rotate a bounded batch without overwriting concurrent projections. */
export async function backfillNumoSurfaceDestinationsBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_NUMO_SURFACE_DESTINATION_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Numo surface destination encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo surface destination batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("numo_surface_events")
    .select("id,actor_id,destination")
    .order("destination_encryption_checked_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Numo surface destinations");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const scope = { kind: "user" as const, id: row.actor_id as string };
      const current = await getContentKeys().current(scope);
      const version = current.version;
      current.bytes.fill(0);
      const old = row.destination as StoredSurfaceDestination;
      const clear = await decodeSurfaceDestination(scope.id, row.id, old);
      const fresh = isEncryptedSurfaceDestination(old) &&
        surfaceDestinationState(old).version === version &&
        surfaceDestinationState(old).format === 3;
      const cipher = fresh ? old : await encodeSurfaceDestination(scope.id,
        row.id, clear, service);
      if (JSON.stringify(await decodeSurfaceDestination(scope.id, row.id,
        cipher)) !== JSON.stringify(clear)) {
        throw new Error("Numo surface conversion verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_numo_surface_destination", {
        p_id: row.id, p_old: old, p_new: cipher,
      });
      if (write.error) throw new Error("Unable to migrate Numo surface destination");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
