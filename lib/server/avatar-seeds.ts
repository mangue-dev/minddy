import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Avatar seeds (`public.user_avatars`), server side only.
 *
 * A seed is an opaque string: the avatar is drawn by hashing it
 * (`components/user-avatar.tsx`). It does not choose itself, it withdraws by lot.
 * The table has no RLS policy — only the service key reads it, and the seeds
 * only exit via routes that already resolve identities, so for the
 * only people the caller has the right to see.
 *
 * To plug in next to `fetchAuthUsersById` (lib/server/auth-users.ts): one
 * gives the name, the other the brand.
 */

/**
 * Resolves the seeds of a batch of accounts, and creates the missing ones.
 *
 * Lazy creation is a trickle, not the normal path: the migration has
 * seeded the existing accounts, and a new account receives its own on the first
 * view. A competing `insert` does not break anything (`on conflict do nothing`,
 * then reread).
 *
 * A seed not found despite everything falls back on the account identifier: better
 * is worth a stable mark than a hole in interface.
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

    // `ignoreDuplicates` returns nothing for a line already present (race
    // between two requests): we reread those that are still missing.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The seed of an account if he has one — without ever creating one.
 *
 * The read-only counterpart of `fetchAvatarSeed`, for the caller who does not know
 * NOT yet if the identifier he is holding designates a minddy account: the
 * `external_id` of a visitor to the public board, for example. `user_avatars`
 * references `auth.users`, so a line found PROVES the account. That's all
 * the point of not creating here: lazy creation would invent a mark
 * for a foreign identifier, and would obfuscate the proof.
 *
 * An identifier that is not a UUID does not reach the base: Postgres
 * would refuse the comparison (22P02) and the error would go unnoticed.
 */
export async function findAvatarSeed(
  service: SupabaseClient,
  userId: string | null | undefined
): Promise<string | null> {
  if (!userId || !UUID_RE.test(userId)) return null;
  const { data } = await service
    .from("user_avatars")
    .select("seed")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.seed as string | undefined) ?? null;
}

/** The seed of a single account (same guarantees as `fetchAvatarSeeds`). */
export async function fetchAvatarSeed(
  service: SupabaseClient,
  userId: string
): Promise<string> {
  const seeds = await fetchAvatarSeeds(service, [userId]);
  return seeds.get(userId) ?? userId;
}

/**
 * Adopts the CHOSEN seed at registration (MIN-300), if there is not already a line.
 *
 * The wizard pulls the avatar into the browser, before no account exists:
 * there is no session to write it to yet. The seed therefore travels in the
 * `user_metadata` of the account (`avatar_seed`), and lands here at the first
 * opportunity — the passage through `/auth/callback`, or the direct call of the wizard when
 * the session is immediate.
 *
 * `ignoreDuplicates` is the heart of the function: it never REPLACES an existing
 * seed. It can therefore be called at each connection without risk
 * of canceling a "New avatar" made from the settings - the metadata,
 * forever keeps the value of the first day.
 *
 * Returns `true` if the line has just been created with CE seed.
 */
export async function claimAvatarSeed(
  service: SupabaseClient,
  userId: string,
  seed: string | null | undefined
): Promise<boolean> {
  if (!userId || !seed || !UUID_RE.test(seed)) return false;
  const { data, error } = await service
    .from("user_avatars")
    .upsert(
      { user_id: userId, seed },
      { onConflict: "user_id", ignoreDuplicates: true }
    )
    .select("seed");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

/**
 * Draws a new seed, and returns the one that was placed.
 *
 * The draw is done here and not by the base: the default value of the column
 * only applies to insertion, and PostgREST does not know how to write
 * `set seed = gen_random_uuid()`. Same random source (UUID v4), therefore same
 * draw quality.
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
