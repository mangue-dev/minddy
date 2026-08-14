import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSavedViewHref,
  normalizeViewName,
} from "@/lib/saved-view-href";

/**
 * Écritures des VUES ENREGISTRÉES (la palette de commandes). Personnelles par
 * construction : tout passe par le client authentifié de l'appelant, donc RLS
 * (`user_id = auth.uid()`) est la garde, pas une vérification recopiée ici.
 *
 * Le seul choix de fond est dans `createSavedView` : enregistrer sous un nom
 * déjà pris MET À JOUR l'adresse au lieu d'empiler une deuxième ligne homonyme.
 * Dans une palette, deux lignes du même nom sont deux lignes qu'on ne peut plus
 * distinguer — et « je réenregistre ma vue de la semaine » veut dire ça.
 */

export type SavedViewResult =
  | { ok: true; view: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      /** Clé du namespace i18n `ApiErrors`. */
      errorKey:
        | "nameRequired"
        | "invalidViewHref"
        | "viewNotFound"
        | "savedViewNameTaken"
        | "databaseError";
    };

/** Violation de l'index unique `(user_id, name)` — deux vues du même nom. */
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

  // `onConflict` sur l'index unique (user_id, name) : réenregistrer sous un nom
  // connu déplace la vue, `updated_at` suit par le trigger.
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
    // Renommer sur un nom déjà pris n'est pas une panne : c'est une question
    // posée à l'utilisateur. La création, elle, tranche toute seule (l'upsert
    // déplace la vue homonyme) — mais un RENOMMAGE qui écraserait une autre vue
    // en ferait disparaître une sans le dire.
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, status: 409, errorKey: "savedViewNameTaken" };
    }
    console.error("[saved-views] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  // Invisible par RLS (la vue d'un autre compte) → même signal qu'inexistante.
  if (!data) return { ok: false, status: 404, errorKey: "viewNotFound" };
  return { ok: true, view: data };
}
