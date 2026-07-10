/**
 * Lookup host → cible publique pour le middleware (MIN-36).
 *
 * Volontairement SANS supabase-js ni "server-only" : proxy.ts (middleware)
 * l'importe et son bundle doit rester minimal — on parle à PostgREST en fetch
 * direct avec la clé service. Ne JAMAIS importer ce module côté client (la clé
 * service n'y serait pas définie, et il n'a aucun sens hors serveur).
 *
 * La table custom_domains stocke les ids ; les tokens sont joints ici, donc une
 * rotation de token est répercutée au prochain lookup (modulo le TTL du cache).
 */

export type DomainTarget = { kind: "feedback" | "share"; token: string };

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1_000;

// Cache module-scope : en Fluid Compute l'instance est réutilisée entre
// requêtes, donc un host actif ne coûte ~1 requête DB par minute. Les négatifs
// sont aussi cachés (host inconnu marteau → pas de DB à chaque hit).
const cache = new Map<string, { at: number; value: DomainTarget | null }>();

export async function lookupCustomDomain(host: string): Promise<DomainTarget | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = await fetchTarget(host);

  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(host, { at: Date.now(), value });
  return value;
}

/** Invalidation immédiate après set/remove côté réglages (même instance). */
export function invalidateCustomDomainCache(host?: string): void {
  if (host) cache.delete(host);
  else cache.clear();
}

async function fetchTarget(host: string): Promise<DomainTarget | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  const query =
    `${url}/rest/v1/custom_domains` +
    `?domain=eq.${encodeURIComponent(host)}` +
    `&select=feedback_boards(token),view_shares(token)&limit=1`;
  try {
    const res = await fetch(query, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[custom-domains] lookup PostgREST ${res.status} for host ${host}`);
      return null;
    }
    const rows = (await res.json()) as Array<{
      feedback_boards: { token: string } | null;
      view_shares: { token: string } | null;
    }>;
    const row = rows[0];
    if (!row) return null;
    if (row.feedback_boards?.token) return { kind: "feedback", token: row.feedback_boards.token };
    if (row.view_shares?.token) return { kind: "share", token: row.view_shares.token };
    return null;
  } catch (e) {
    console.error("[custom-domains] lookup failed:", (e as Error).message);
    return null;
  }
}
