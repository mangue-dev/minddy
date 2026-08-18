import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSavedViewHref,
  normalizeViewName,
} from "@/lib/saved-view-href";

/**
 * Writes SAVED VIEWS (the command palette). Personal by
 * construction: everything goes through the caller's authenticated client, so RLS
 * (`user_id = auth.uid()`) is the guard, not a check copied here.
 *
 * The only background choice is in `createSavedView`: save as a name
 * already taken UPDATEs the address instead of stacking a second row of the same name.
 * In a palette, two rows of the same name are two rows that can no longer be distinguished
 * — and “I'm re-saving my view for the week” means that.
 */

export type SavedViewResult =
  | { ok: true; view: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      /** Key for i18n namespace `ApiErrors`. */
      errorKey:
        | "nameRequired"
        | "invalidViewHref"
        | "viewNotFound"
        | "savedViewNameTaken"
        | "databaseError";
    };

/** Unique index violation `(user_id, name)` — two views with the same name. */
const UNIQUE_VIOLATION = "23505";

export async function createSavedView(
  supabase: SupabaseClient,
  userId: string,
  input: { name?: unknown; href?: unknown }
): Promise<SavedViewResult> {
  const name = normalizeViewName(input.name);
  if (!name) return { ok: false, status: 400, errorKey: "nameRequired" };
  if (!isSavedViewHref(input.href)) {
    return { ok: false, status: 400, errorKey: "invalidViewHref" };
  }

  // `onConflict` on unique index (user_id, name): resave under a name
  // known moves the view, `updated_at` follows with the trigger.
  const { data, error } = await supabase
    .from("saved_views")
    .upsert(
      { user_id: userId, name, href: input.href },
      { onConflict: "user_id,name" }
    )
    .select()
    .single();

  if (error) {
    console.error("[saved-views] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, view: data };
}

export async function updateSavedView(
  supabase: SupabaseClient,
  id: string,
  input: { name?: unknown; href?: unknown }
): Promise<SavedViewResult> {
  const updates: Record<string, string> = {};

  if (input.name !== undefined) {
    const name = normalizeViewName(input.name);
    if (!name) return { ok: false, status: 400, errorKey: "nameRequired" };
    updates.name = name;
  }
  if (input.href !== undefined) {
    if (!isSavedViewHref(input.href)) {
      return { ok: false, status: 400, errorKey: "invalidViewHref" };
    }
    updates.href = input.href;
  }
  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "nameRequired" };
  }

  const { data, error } = await supabase
    .from("saved_views")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    // Renaming to a name already taken is not a problem: it's a question
    // asked to the user. Creation decides on its own (the upsert
    // moves the homonymous view) — but a RENAMING which would overwrite another view
    // would make one disappear without saying it.
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, status: 409, errorKey: "savedViewNameTaken" };
    }
    console.error("[saved-views] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  // Invisible by RLS (the view of another account) → same signal as non-existent.
  if (!data) return { ok: false, status: 404, errorKey: "viewNotFound" };
  return { ok: true, view: data };
}
