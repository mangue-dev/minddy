import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enforces an account's storage limit for server-side writes (MIN-348).
 *
 * Browser uploads are constrained by the Storage policy. Server uploads use
 * the service role and bypass RLS, so they must ask the same database-owned
 * quota model whether the complete pending write still fits.
 */

/**
 * Returns `false` when the project owner cannot store all additional bytes.
 * Database errors fail closed because the service role has no downstream RLS
 * policy to catch an upload admitted here.
 */
export async function projectStorageAllowed(
  service: SupabaseClient,
  projectId: string,
  additionalBytes = 0,
): Promise<boolean> {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) return false;
  const { data, error } = await service.rpc("project_storage_quota_allows", {
    p_project: projectId,
    p_additional_bytes: additionalBytes,
  });
  if (error) {
    console.error("[storage-quota] check failed:", error.message);
    return false;
  }
  return data === true;
}
