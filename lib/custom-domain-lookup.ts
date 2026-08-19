/**
 * Lookup host → public target for the middleware (MIN-36).
 *
 * Deliberately WITHOUT supabase-js nor "server-only": proxy.ts (middleware)
 * imports it and its bundle must remain minimal — we are talking to PostgREST in fetch
 * direct with the service key. NEVER import this module client-side (the
 * service key would not be defined there, and it has no meaning outside of the server).
 *
 * The custom_domains table stores the ids; the tokens are attached here, so a
 * token rotation is passed on to the next lookup (modulo the TTL of the cache).
 *
 * The lookup ALSO makes the project owner (MIN-337): it is the tenant of the
 * domain, and the middleware uses it to refuse the tokens under this name des
 * others. Without it, `/f/<token d'un inconnu>` went as is to the
 * client domain, in valid HTTPS and under its brand.
 */

export type PublicTokenKind = "feedback" | "share" | "page";

export type DomainTarget = {
  kind: "feedback" | "share";
  token: string;
  /** Project owner of the board / shared view served at the root. */
  projectId: string;
};

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1_000;

// Module-scope cache: in Fluid Compute the instance is reused between
// requests, so an active host only costs ~1 DB request per minute. The negatives
// are also hidden (unknown host hammer → no DB on each hit).
//
// The key is the STANDARDIZED host as it was used for the PostgREST request, and the
// value only comes from this request: a manufactured `Host:` cannot
// poison the entrance to another domain, he only populates his own
// (terminal: CACHE_MAX_ENTRIES, global purge on overflow).
const cache = new Map<string, { at: number; value: DomainTarget | null }>();

// Same mechanics for token → project: the middleware consults it on each
// public path of a client domain, it must cost one request per minute and
// per token, not one per visit.
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
 * Project owning a public token (`/f/<t>`, `/share/<t>`, `/p/<t>`).
 * `null` = unknown token. Published pages and shared views live in
 * the same table since MIN-283, hence the cache key by TABLE and not by kind.
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

/** Immediate invalidation after set/remove on the settings side (same instance). */
export function invalidateCustomDomainCache(host?: string): void {
  if (host) cache.delete(host);
  else cache.clear();
  // Tokens do not move with a domain, but with a test (and a rotation)
  // must not drag the old cache.
  if (!host) tokenCache.clear();
}

/** PostgREST in service key, JSON or `null` on any error (never throw). */
async function restRows<T>(query: string, what: string): Promise<T[] | null> {
  const url = process.env.MINDDY_PUBLIC_SUPABASE_URL;
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
 * `status=eq.verified` (MIN-337): a domain was routed AS SOON AS ITS INSERTION,
 * that is to say before anyone had proven to own it. The status is that
 * that Vercel returns (CNAME in place + TXT challenge satisfied); as long as
 * is not checked, the line exists, the UI shows the DNS records to be created — and the host is of no use.
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
