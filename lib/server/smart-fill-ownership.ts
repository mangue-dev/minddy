import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { afterOrNow } from "@/lib/server/after-safe";

/**
 * What Smart Fill still owns on an issue, and its pending re-evaluation
 * (MIN-750). Kept apart from the worker in `smart-fill-reevaluation.ts`: the
 * write paths call these helpers, and the worker calls the write paths.
 */

/** The properties Smart Fill can own — the migrations' CHECK lists the same
 * five (`title` since MIN-798, only when the author left it empty). */
export type SmartFillOwnedField = "priority" | "effort" | "category_ids" | "objective_id" | "title";

/** How long the title and description must rest before the pass runs. */
export const REEVALUATION_DELAY_MS = 5 * 60_000;

/**
 * Record what Smart Fill owns on an issue it was armed for at creation: the
 * fields the author left empty, whether or not this first pass filled them.
 * Best-effort: without the row the issue is simply never re-evaluated.
 */
export async function recordSmartFillOwnership(
  service: SupabaseClient,
  input: { issueId: string; projectId: string; fields: SmartFillOwnedField[] },
): Promise<void> {
  if (input.fields.length === 0) return;
  const { error } = await service.from("issue_smart_fill").insert({
    issue_id: input.issueId,
    project_id: input.projectId,
    fields: input.fields,
  });
  if (error) console.error("[smart-fill-reevaluation] ownership record failed");
}

/**
 * Take properties back from Smart Fill after someone changed them by hand.
 * Awaited by the write paths before they answer: a release lost after the
 * response would let a later pass overwrite a value a person chose. One SQL
 * function, so two releases on the same issue cannot overwrite each other;
 * it deletes the row once Smart Fill owns nothing, which also ends the
 * issue's pending and future passes.
 */
export async function releaseSmartFillFields(
  service: SupabaseClient,
  issueId: string,
  released: readonly SmartFillOwnedField[],
): Promise<void> {
  if (released.length === 0) return;
  const { error } = await service.rpc("release_smart_fill_fields", {
    p_issue_id: issueId,
    p_fields: released,
  });
  if (error) console.error("[smart-fill-reevaluation] ownership release failed");
}

/** The properties Smart Fill owns on the issue right now (empty without a row). */
export async function readSmartFillOwnership(
  service: SupabaseClient,
  issueId: string,
): Promise<SmartFillOwnedField[] | null> {
  const { data, error } = await service
    .from("issue_smart_fill")
    .select("fields")
    .eq("issue_id", issueId)
    .maybeSingle();
  if (error) return null;
  return ((data?.fields as SmartFillOwnedField[] | undefined) ?? []);
}

/**
 * Push the issue's pending pass five minutes ahead, as `actorId`. A no-op for
 * an issue without a row — including one whose properties were all taken
 * back, since its row is gone; best-effort, after the response.
 */
export function scheduleSmartFillReevaluation(input: { issueId: string; actorId: string }): void {
  afterOrNow(async () => {
    const { error } = await getServiceClient()
      .from("issue_smart_fill")
      .update({
        reevaluate_at: new Date(Date.now() + REEVALUATION_DELAY_MS).toISOString(),
        reevaluate_by: input.actorId,
      })
      .eq("issue_id", input.issueId);
    if (error) console.error("[smart-fill-reevaluation] schedule failed");
  });
}
