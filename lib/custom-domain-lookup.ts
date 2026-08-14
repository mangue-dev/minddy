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
 *
 * Le lookup rend AUSSI le projet propriétaire (MIN-337) : c'est le locataire du
 * domaine, et le middleware s'en sert pour refuser sous ce nom les tokens des
 * autres. Sans lui, `/f/<token d'un inconnu>` se rendait tel quel sur le
 * domaine du client, en HTTPS valide et sous sa marque.
 */

export type PublicTokenKind = "feedback" | "share" | "page";

export type DomainTarget = {
  kind: "feedback" | "share";
  token: string;
  /** Projet propriétaire du board / de la vue partagée servi à la racine. */
  projectId: string;
};

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1_000;

// Cache module-scope : en Fluid Compute l'instance est réutilisée entre
// requêtes, donc un host actif ne coûte ~1 requête DB par minute. Les négatifs
// sont aussi cachés (host inconnu marteau → pas de DB à chaque hit).
//
// La clé est le host NORMALISÉ tel qu'il a servi à la requête PostgREST, et la
// valeur ne vient que de cette requête-là : un `Host:` fabriqué ne peut pas
// empoisonner l'entrée d'un autre domaine, il ne fait que peupler la sienne
// (borne : CACHE_MAX_ENTRIES, purge globale au débordement).
const cache = new Map<string, { at: number; value: DomainTarget | null }>();

// Même mécanique pour token → projet : le middleware la consulte sur chaque
// chemin public d'un domaine client, elle doit coûter une requête par minute et
// par token, pas une par visite.
const tokenCache = new Map<string, { at: number; value: string | null }>();

export async function lookupCustomDomain(host: string): Promise<DomainTarget | null> {
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = await fetchTarget(host);

  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(host, { at: Date.now(), value });
  return value;
}

/**
 * Projet propriétaire d'un token public (`/f/<t>`, `/share/<t>`, `/p/<t>`).
 * `null` = token inconnu. Les pages publiées et les vues partagées vivent dans
 * la même table depuis MIN-283, d'où la clé de cache par TABLE et non par kind.
 */
export async function lookupTokenProject(
  kind: PublicTokenKind,
  token: string,
): Promise<string | null> {
  const key = `${kind === "feedback" ? "board" : "share"}:${token}`;
  const hit = tokenCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const value = kind === "feedback" ? await fetchBoardProject(token) : await fetchShareProject(token);

  if (tokenCache.size >= CACHE_MAX_ENTRIES) tokenCache.clear();
  tokenCache.set(key, { at: Date.now(), value });
  return value;
}

/** Invalidation immédiate après set/remove côté réglages (même instance). */
export function invalidateCustomDomainCache(host?: string): void {
  if (host) cache.delete(host);
  else cache.clear();
  // Les tokens ne bougent pas avec un domaine, mais un test (et une rotation)
  // ne doivent pas se traîner l'ancien cache.
  if (!host) tokenCache.clear();
}

/** PostgREST en clé service, JSON ou `null` sur toute erreur (jamais de throw). */
async function restRows<T>(query: string, what: string): Promise<T[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  try {
    const res = await fetch(`${url}/rest/v1/${query}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[custom-domains] lookup PostgREST ${res.status} for ${what}`);
      return null;
    }
    return (await res.json()) as T[];
  } catch (e) {
    console.error("[custom-domains] lookup failed:", (e as Error).message);
    return null;
  }
}

/**
 * `status=eq.verified` (MIN-337) : un domaine était routé DÈS SON INSERTION,
 * c'est-à-dire avant que quiconque ait prouvé le posséder. Le statut est celui
 * que Vercel renvoie (CNAME en place + challenge TXT satisfait) ; tant qu'il
 * n'est pas vérifié, la ligne existe, l'UI affiche les enregistrements DNS à
 * créer — et le host ne sert rien.
 */
async function fetchTarget(host: string): Promise<DomainTarget | null> {
  const rows = await restRows<{
    feedback_boards: { token: string; project_id: string } | null;
    view_shares: {
      token: string;
      views: { project_id: string } | null;
      pages: { project_id: string } | null;
    } | null;
  }>(
    `custom_domains?domain=eq.${encodeURIComponent(host)}&status=eq.verified` +
      `&select=feedback_boards(token,project_id),view_shares(token,views(project_id),pages(project_id))&limit=1`,
    `host ${host}`,
  );
  const row = rows?.[0];
  if (!row) return null;

  const board = row.feedback_boards;
  if (board?.token && board.project_id) {
    return { kind: "feedback", token: board.token, projectId: board.project_id };
  }
  const share = row.view_shares;
  const shareProject = share?.views?.project_id ?? share?.pages?.project_id;
  if (share?.token && shareProject) {
    return { kind: "share", token: share.token, projectId: shareProject };
  }
  return null;
}

async function fetchBoardProject(token: string): Promise<string | null> {
  const rows = await restRows<{ project_id: string }>(
    `feedback_boards?token=eq.${encodeURIComponent(token)}&select=project_id&limit=1`,
    "board token",
  );
  return rows?.[0]?.project_id ?? null;
}

async function fetchShareProject(token: string): Promise<string | null> {
  const rows = await restRows<{
    views: { project_id: string } | null;
    pages: { project_id: string } | null;
  }>(
    `view_shares?token=eq.${encodeURIComponent(token)}&select=views(project_id),pages(project_id)&limit=1`,
    "share token",
  );
  const row = rows?.[0];
  return row?.views?.project_id ?? row?.pages?.project_id ?? null;
}
