/**
 * The Supabase project ref when the API runs on a custom domain (MIN-960).
 *
 * Supabase derives two names from the first label of the API hostname:
 * the session cookie (`sb-<ref>-auth-token`) and, in minddy, the managed AI
 * key prefix. On `https://<ref>.supabase.co` that label is the project ref.
 * On a custom domain such as `https://auth.minddy.app` it is `auth`, so a
 * switch would rename the cookie (signing every session out) and orphan the
 * managed keys. `MINDDY_PUBLIC_SUPABASE_PROJECT_REF` pins the ref; unset,
 * every name keeps its hostname-derived default.
 */

const PROJECT_REF = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The declared ref, or null when unset. Throws on a value that is not a ref. */
export function declaredSupabaseProjectRef(value: string | null | undefined): string | null {
  const ref = value?.trim();
  if (!ref) return null;
  if (!PROJECT_REF.test(ref)) {
    throw new Error(
      "Invalid MINDDY_PUBLIC_SUPABASE_PROJECT_REF: expected a Supabase project ref (lowercase letters, digits and hyphens)",
    );
  }
  return ref;
}

/** The cookie name `@supabase/ssr` uses for a session of this project. */
export function supabaseSessionCookieName(projectRef: string): string {
  return `sb-${projectRef}-auth-token`;
}
