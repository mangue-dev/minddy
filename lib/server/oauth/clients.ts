import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { generateClientId } from "@/lib/server/oauth/crypto";

/**
 * Clients OAuth enregistrés dynamiquement (RFC 7591). Clients publics
 * uniquement (token_endpoint_auth_method "none") — aucun secret n'existe,
 * la sécurité repose sur PKCE + la validation stricte des redirect_uris.
 */

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Schémas qui exécutent du script ou lisent le disque là où le callback est
    suivi — `Location:` du navigateur, `href` de l'interstitiel de succès. Un
    client qui en enregistre un ne demande pas un callback, il demande une XSS
    stockée : refus catégorique, avant même de regarder le reste. */
const DANGEROUS_SCHEMES = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
  "blob:",
  "about:",
  "filesystem:",
]);

/** Schéma privé d'application native (RFC 8252 §7.1) : `cursor:`, `vscode:`… */
const PRIVATE_SCHEME = /^[a-z][a-z0-9+.-]*:$/;

/** https obligatoire, sauf loopback http (clients CLI, RFC 8252 §7.3) et
    schéma privé d'app native (RFC 8252 §7.1). Fragment interdit
    (RFC 6749 §3.1.2).

    Le schéma privé N'EST PAS une largesse : c'est le seul callback qu'une app
    de bureau sait recevoir, et sans lui Cursor ne peut pas s'authentifier du
    tout — il enregistre `cursor://anysphere.cursor-mcp/oauth/callback`, se
    faisait refuser à l'inscription, et la connexion échouait sur
    « Redirect URI must be https ». Ce qui protège ici, c'est PKCE plus la
    validation stricte de l'URI enregistrée, pas le schéma. */
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

/** Hygiène DCR : purge opportuniste des clients de plus de 7 jours sans
    aucun grant (spam d'enregistrement). Fire-and-forget. */
export function cleanupOrphanClients(): void {
  const service = getServiceClient();
  void (async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { data: used } = await service.from("oauth_grants").select("client_id");
    const keep = new Set((used ?? []).map((g) => g.client_id as string));
    const { data: stale } = await service
      .from("oauth_clients")
      .select("client_id")
      .lt("created_at", cutoff)
      .limit(200);
    const doomed = (stale ?? [])
      .map((c) => c.client_id as string)
      .filter((id) => !keep.has(id));
    if (doomed.length > 0) {
      const { error } = await service
        .from("oauth_clients")
        .delete()
        .in("client_id", doomed);
      if (error) console.error("[oauth/clients] cleanup:", error.message);
    }
  })();
}
