import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeSavedView, encodeSavedView, savedViewNameIndex,
  savedViewValues, shouldProtectSavedViews } from "./saved-view-bookmark";
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

  if (await shouldProtectSavedViews()) {
    const nameIndex = await savedViewNameIndex(userId, name);
    for (let attempt = 0; attempt < 3; attempt++) {
      const indexed = await supabase.from("saved_views").select("*")
        .eq("user_id", userId).eq("name_index", nameIndex).maybeSingle();
      if (indexed.error) break;
      let existing = indexed.data;
      if (!existing) {
        const legacy = await supabase.from("saved_views").select("*")
          .eq("user_id", userId).eq("name", name).maybeSingle();
        if (legacy.error) break;
        existing = legacy.data;
      }
      if (existing) {
        const plain = await decodeSavedView(existing, userId);
        const encoded = await encodeSavedView({ ...plain, href: input.href,
          encryption_version: existing.encryption_version });
        const write = await supabase.from("saved_views")
          .update(savedViewValues(encoded)).eq("id", existing.id)
          .eq("content_revision", existing.content_revision ?? 0)
          .select("*").maybeSingle();
        if (write.error) break;
        if (write.data) return { ok: true,
          view: await decodeSavedView(write.data, userId) };
        continue;
      }
      const encoded = await encodeSavedView({ id: randomUUID(), user_id: userId,
        name, href: input.href }, { force: true });
      const write = await supabase.from("saved_views").insert(encoded)
        .select("*").single();
      if (!write.error && write.data) return { ok: true,
        view: await decodeSavedView(write.data, userId) };
      if (write.error?.code === UNIQUE_VIOLATION) continue;
      break;
    }
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Legacy equality remains available until all rows have been converted.
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
  return { ok: true, view: await decodeSavedView(data, userId) };
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

  for (let attempt = 0; attempt < 3; attempt++) {
    const read = await supabase.from("saved_views").select("*")
      .eq("id", id).maybeSingle();
    if (read.error) return { ok: false, status: 500, errorKey: "databaseError" };
    if (!read.data) return { ok: false, status: 404,
      errorKey: "viewNotFound" };
    const userId = read.data.user_id as string;
    const plain = await decodeSavedView(read.data, userId);
    const encoded = await encodeSavedView({ ...plain, ...updates,
      encryption_version: read.data.encryption_version });
    let write = supabase.from("saved_views")
      .update(savedViewValues(encoded)).eq("id", id);
    if (read.data.content_revision !== undefined) {
      write = write.eq("content_revision", read.data.content_revision);
    }
    const { data, error } = await write.select("*").maybeSingle();
    if (!error && data) return { ok: true,
      view: await decodeSavedView(data, userId) };
    if (!error) continue;
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
  return { ok: false, status: 500, errorKey: "databaseError" };
}
