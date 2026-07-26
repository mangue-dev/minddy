import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Les seeds d'avatar (`public.user_avatars`), côté serveur uniquement.
 *
 * Un seed est une chaîne opaque : l'avatar se dessine en la hachant
 * (`components/user-avatar.tsx`). Il ne se choisit pas, il se retire au sort.
 * La table n'a aucune policy RLS — seule la clé de service la lit, et les seeds
 * ne sortent que par les routes qui résolvent déjà les identités, donc pour les
 * seules personnes que l'appelant a le droit de voir.
 *
 * À brancher à côté de `fetchAuthUsersById` (lib/server/auth-users.ts) : l'un
 * donne le nom, l'autre la marque.
 */

/**
 * Résout les seeds d'un lot de comptes, et crée ceux qui manquent.
 *
 * La création paresseuse est un filet, pas le chemin normal : la migration a
 * semé les comptes existants, et un compte neuf reçoit le sien au premier
 * affichage. Un `insert` concurrent ne casse rien (`on conflict do nothing`,
 * puis relecture).
 *
 * Un seed introuvable malgré tout retombe sur l'identifiant du compte : mieux
 * vaut une marque stable qu'un trou dans l'interface.
 */
export async function fetchAvatarSeeds(
  service: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const seeds = new Map<string, string>();
  if (unique.length === 0) return seeds;

  const { data } = await service
    .from("user_avatars")
    .select("user_id, seed")
    .in("user_id", unique);
  for (const row of data ?? []) seeds.set(row.user_id as string, row.seed as string);

  const missing = unique.filter((id) => !seeds.has(id));
  if (missing.length > 0) {
    const { data: created } = await service
      .from("user_avatars")
      .upsert(
        missing.map((user_id) => ({ user_id })),
        { onConflict: "user_id", ignoreDuplicates: true }
      )
      .select("user_id, seed");
    for (const row of created ?? []) seeds.set(row.user_id as string, row.seed as string);

    // `ignoreDuplicates` ne renvoie rien pour une ligne déjà présente (course
    // entre deux requêtes) : on relit celles qui manquent encore.
    const stillMissing = missing.filter((id) => !seeds.has(id));
    if (stillMissing.length > 0) {
      const { data: reread } = await service
        .from("user_avatars")
        .select("user_id, seed")
        .in("user_id", stillMissing);
      for (const row of reread ?? []) seeds.set(row.user_id as string, row.seed as string);
      for (const id of stillMissing) if (!seeds.has(id)) seeds.set(id, id);
    }
  }

  return seeds;
}

/** Le seed d'un seul compte (même garanties que `fetchAvatarSeeds`). */
export async function fetchAvatarSeed(
  service: SupabaseClient,
  userId: string
): Promise<string> {
  const seeds = await fetchAvatarSeeds(service, [userId]);
  return seeds.get(userId) ?? userId;
}

/**
 * Retire un nouveau seed au sort, et renvoie celui qui a été posé.
 *
 * Le tirage est fait ici et non par la base : la valeur par défaut de la colonne
 * ne s'applique qu'à l'insertion, et PostgREST ne sait pas écrire
 * `set seed = gen_random_uuid()`. Même source d'aléa (UUID v4), donc même
 * qualité de tirage.
 */
export async function regenerateAvatarSeed(
  service: SupabaseClient,
  userId: string
): Promise<string> {
  const { data, error } = await service
    .from("user_avatars")
    .upsert(
      { user_id: userId, seed: crypto.randomUUID(), updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select("seed")
    .single();
  if (error) throw new Error(error.message);
  return data.seed as string;
}
