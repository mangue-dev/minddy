import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { generateClientId } from "@/lib/server/oauth/crypto";

/**
 * Dynamically registered OAuth clients (RFC 7591). Public clients
 * only (token_endpoint_auth_method "none") — no secrets exist,
 * security relies on PKCE + strict validation of redirect_uris.
 */

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Schemes that execute script or read disk where the callback is
 followed by — `Location:` of the browser, `href` of the success interstitial. A
 client which registers one does not request a callback, it requests a stored XSS
: categorical refusal, before even looking at the rest. */
const DANGEROUS_SCHEMES = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
  "about:",
  "filesystem:",
]);

/** Private native application schema (RFC 8252 §7.1): `cursor:`, `vscode:`… */
const PRIVATE_SCHEME = /^[a-z][a-z0-9+.-]*:$/;

/** https required, except loopback http (CLI clients, RFC 8252 §7.3) and
 native app private schema (RFC 8252 §7.1). Forbidden fragment
 (RFC 6749 §3.1.2).

 The private schema is NOT a gift: it is the only callback that a desktop app
 can receive, and without it Cursor cannot authenticate from
 at all — it registers `cursor://anysphere.cursor-mcp/oauth/callback`, was refused registration, and connection failed on
 “Redirect URI must be https”. What's protecting here is PKCE plus strict validation of the registered URI, not the scheme. */
export function isAllowedRedirectUri(uri: unknown): boolean {
  if (typeof uri !== "string" || uri.length > 2000) return false;
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash) return false;
  if (DANGEROUS_SCHEMES.has(parsed.protocol)) return false;
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:") return LOOPBACK_HOSTS.has(parsed.hostname);
  return PRIVATE_SCHEME.test(parsed.protocol);
}

export async function registerClient({
  clientName,
  redirectUris,
  logoUri,
  clientUri,
}: {
  clientName: string;
  redirectUris: string[];
  logoUri?: string | null;
  clientUri?: string | null;
}): Promise<OAuthClient | null> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("oauth_clients")
    .insert({
      client_id: generateClientId(),
      client_name: clientName,
      redirect_uris: redirectUris,
      logo_uri: logoUri ?? null,
      client_uri: clientUri ?? null,
    })
    .select("client_id, client_name, redirect_uris, created_at")
    .single();
  if (error) {
    console.error("[oauth/clients] register failed:", error.message);
    return null;
  }
  return data as unknown as OAuthClient;
}

export async function getClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== "string" || !clientId) return null;
  const { data } = await getServiceClient()
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris, created_at")
    .eq("client_id", clientId)
    .maybeSingle();
  return (data as unknown as OAuthClient) ?? null;
}

/** Grant scan page size — bounded by PostgREST anyway. */
const GRANT_PAGE = 1000;

/**
 * Selects, among candidate clients, those who have NO grants.
 *
 * The order of reasoning is the sensitive point. The original version read
 * `select("client_id")` on ALL `oauth_grants` * to make it the whole "to
 * keep": beyond the implicit limit of PostgREST, the list returns
 * truncated without saying so, and any unread grant becomes an "orphaned" client »
 * — therefore deleted, and the FK then took away the grants of all its
 * users. A “to keep” set constructed by a partial reading
 * cannot be used to decide on a deletion.
 *
 * Here the reading is limited to candidates only, paginated until exhaustion,
 * and the slightest error does not return anything: we only delete what we have
 * proof positive that it is empty.
 */
export async function selectClientsWithoutGrants(
  candidateIds: string[],
  readGrantPage: (
    ids: string[],
    from: number,
    to: number
  ) => Promise<{ clientIds: string[] } | { failed: true }>
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const used = new Set<string>();
  for (let from = 0; ; from += GRANT_PAGE) {
    const page = await readGrantPage(candidateIds, from, from + GRANT_PAGE - 1);
    if ("failed" in page) return [];
    for (const id of page.clientIds) used.add(id);
    // Incomplete page = end of scanning. All candidates already covered =
    // nothing more to learn.
    if (page.clientIds.length < GRANT_PAGE) break;
    if (used.size >= candidateIds.length) break;
  }
  return candidateIds.filter((id) => !used.has(id));
}

/** DCR Hygiene: opportunistic purge of clients older than 7 days without
 any grant (registration spam). Fire-and-forget. */
export function cleanupOrphanClients(): void {
  const service = getServiceClient();
  void (async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: stale, error: staleError } = await service
      .from("oauth_clients")
      .select("client_id")
      .lt("created_at", cutoff)
      .limit(200);
    if (staleError) {
      console.error("[oauth/clients] cleanup scan:", staleError.message);
      return;
    }
    const candidates = (stale ?? []).map((c) => c.client_id as string);

    const doomed = await selectClientsWithoutGrants(candidates, async (ids, from, to) => {
      const { data, error } = await service
        .from("oauth_grants")
        .select("client_id")
        .in("client_id", ids)
        .range(from, to);
      if (error) {
        console.error("[oauth/clients] cleanup grants:", error.message);
        return { failed: true };
      }
      return { clientIds: (data ?? []).map((g) => g.client_id as string) };
    });

    if (doomed.length > 0) {
      const { error } = await service
        .from("oauth_clients")
        .delete()
        .in("client_id", doomed);
      if (error) console.error("[oauth/clients] cleanup:", error.message);
    }
  })();
}
