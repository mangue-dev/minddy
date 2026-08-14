import "server-only";

import type { User } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Whether a user is a minddy admin — the single gate for the admin dashboard
 * (`/admin`) and its API (`/api/admin/*`).
 *
 * Two sources, either grants access:
 *  - `app_metadata.role === "admin"` (set server-side on the account, tamper-proof
 *    since app_metadata isn't user-writable),
 *  - the `ADMIN_EMAILS` allowlist — a comma-separated list of emails. This is the
 *    primary knob (matches AutoKap): flip an env var, no migration, no code.
 *
 * ## Pourquoi cette fonction est ASYNCHRONE (MIN-344)
 *
 * L'allowlist compare une ADRESSE, et le JWT en porte une — mais rien dans le
 * jeton ne dit que cette adresse a été CONFIRMÉE. Quiconque s'inscrit avec
 * l'adresse d'un admin (typiquement un admin pas encore inscrit, ou une instance
 * fraîche dont `ADMIN_EMAILS` est déjà rempli) obtenait alors le privilège le
 * plus élevé du produit sans jamais avoir ouvert la boîte mail.
 *
 * Le `email_verified` de `user_metadata` ne répond pas à la question : ce champ
 * est ÉCRIVABLE par l'utilisateur (`auth.updateUser({ data })`), donc forgeable.
 * La seule source qui fasse foi est `email_confirmed_at` sur `auth.users`, qu'on
 * va lire chez GoTrue en clé de service — et on en profite pour comparer
 * l'allowlist à l'adresse RÉELLE du compte, pas à celle qu'un jeton transporte.
 *
 * Le coût est borné : la lecture n'a lieu que pour un candidat dont l'adresse est
 * DÉJÀ dans l'allowlist (donc jamais pour un visiteur ordinaire), et le résultat
 * est mémorisé une minute — le dashboard admin fan-out plusieurs routes par
 * affichage. La branche `app_metadata.role` ne coûte, elle, aucun appel.
 *
 * Fail-closed : une lecture en échec ne donne pas l'accès.
 */
export function adminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** L'adresse est-elle dans `ADMIN_EMAILS` ? (casse normalisée des deux côtés) */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmailAllowlist().includes(email.trim().toLowerCase());
}

/** Le rôle porté par `app_metadata` — la source tamper-proof, sans IO. */
export function hasAdminRole(
  user: Pick<User, "app_metadata"> | null | undefined
): boolean {
  return (user?.app_metadata as { role?: string } | undefined)?.role === "admin";
}

const CONFIRMED_TTL_MS = 60_000;
const confirmedCache = new Map<string, { at: number; ok: boolean }>();

/** Purge de test — le cache est un détail d'implémentation, pas un état partagé. */
export function resetAdminConfirmationCache(): void {
  confirmedCache.clear();
}

/**
 * Le compte a-t-il une adresse CONFIRMÉE, et cette adresse est-elle celle de
 * l'allowlist ? Lu chez GoTrue (`auth.users`), la seule source qui ne soit pas
 * écrite par l'utilisateur.
 */
async function isConfirmedAdminAccount(userId: string): Promise<boolean> {
  const hit = confirmedCache.get(userId);
  if (hit && Date.now() - hit.at < CONFIRMED_TTL_MS) return hit.ok;

  let ok = false;
  try {
    const { data, error } = await getServiceClient().auth.admin.getUserById(userId);
    const account = data?.user;
    if (error) throw new Error(error.message);
    ok = !!account?.email_confirmed_at && isAdminEmail(account?.email);
  } catch (err) {
    // Fail-closed, et pas de mise en cache d'une panne : le prochain appel
    // réessaie plutôt que de tenir un admin dehors une minute sur un hoquet.
    console.error("[admin] email confirmation check failed:", (err as Error).message);
    return false;
  }

  confirmedCache.set(userId, { at: Date.now(), ok });
  return ok;
}

/**
 * Takes the minimal shape the JWT claims expose (`getAuthedUser` rebuilds `User`
 * from claims), so it works both from route handlers and server components.
 */
export async function isAdminUser(
  user: Pick<User, "id" | "email" | "app_metadata"> | null | undefined
): Promise<boolean> {
  if (!user) return false;
  if (hasAdminRole(user)) return true;
  if (!user.id || !isAdminEmail(user.email)) return false;
  return isConfirmedAdminAccount(user.id);
}
