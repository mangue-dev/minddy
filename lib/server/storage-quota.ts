import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The storage limit of an account, server side (MIN-348).
 *
 * The REAL application of the quota is in SQL — in the policy `attachments
 * insert` (migration 20261229090000), because sending an attachment leaves
 * from the browser straight to the bucket without crossing any of our routes.
 *
 * This module serves the writes which pass through the SERVER: the file
 * page, the attachment filed by an MCP agent. They use the client
 * service, which bypasses RLS — so the policy does not see them, and without this
 * relay they would be the hole in the ceiling that we have just installed.
 *
 * Only one definition of the verdict for all that: both paths call for
 * SAME SQL function. Here we are just asking for it.
 */

/**
 * `false` when the owner of this project has filled his quota.
 *
 * In the event of a base error, we respond `true`: a reading incident must not
 * block the writing of a user in good standing, and the policy remains the net
 * for everything that comes from the browser.
 */
export async function projectStorageAllowed(
  service: SupabaseClient,
  projectId: string
): Promise<boolean> {
  const { data, error } = await service.rpc("project_storage_quota_ok", {
    p_project: projectId,
  });
  if (error) {
    console.error("[storage-quota] check failed:", error.message);
    return true;
  }
  return data !== false;
}
