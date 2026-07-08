import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Clés API personnelles (endpoint MCP) : "mdyk_" + 24 octets aléatoires en
 * base64url, scopées à un utilisateur — l'agent qui les présente agit comme
 * lui sur tous ses projets accessibles. Seul le sha256 hex est stocké ; le
 * plaintext n'est montré qu'une fois, à la création. Écritures via le service
 * client — les routes appelantes DOIVENT avoir authentifié le propriétaire.
 */

export const API_KEY_PREFIX = "mdyk_";

/** sha256 hex de la clé présentée — la seule forme jamais persistée. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) };
}

export const API_KEY_SUMMARY_SELECT =
  "id, name, key_prefix, agent, created_at, last_used_at, revoked_at";

export interface ApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  /** Agent cible du flow « connecter un agent » ; NULL = clé manuelle. */
  agent: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const MAX_NAME_LENGTH = 60;

export async function listApiKeys(userId: string): Promise<ApiKeySummary[] | null> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("api_keys")
    .select(API_KEY_SUMMARY_SELECT)
    .eq("user_id", userId)
    // Les lignes « acteurs OAuth » (grants) vivent dans Applications
    // connectées, pas dans la liste des clés.
    .is("oauth_client_id", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[api-keys] list failed:", error.message);
    return null;
  }
  return (data ?? []) as unknown as ApiKeySummary[];
}

export async function createApiKey({
  userId,
  name,
}: {
  userId: string;
  name: unknown;
}): Promise<
  | { ok: true; apiKey: ApiKeySummary; key: string }
  | { ok: false; status: number; errorKey: "apiKeyNameRequired" | "databaseError" }
> {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    return { ok: false, status: 400, errorKey: "apiKeyNameRequired" };
  }

  const { key, hash, prefix } = generateApiKey();
  const service = getServiceClient();
  const { data, error } = await service
    .from("api_keys")
    .insert({
      user_id: userId,
      name: trimmed,
      key_hash: hash,
      key_prefix: prefix,
    })
    .select(API_KEY_SUMMARY_SELECT)
    .single();

  if (error) {
    console.error("[api-keys] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, apiKey: data as unknown as ApiKeySummary, key };
}

export async function revokeApiKey({
  userId,
  keyId,
}: {
  userId: string;
  keyId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; errorKey: "apiKeyNotFound" | "databaseError" }
> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    console.error("[api-keys] revoke failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, errorKey: "apiKeyNotFound" };
  }
  return { ok: true };
}

/**
 * Flow « connecter un agent » : garantit une clé ACTIVE par (user, agent) dont
 * le plaintext n'est délivré qu'à la création. Si une clé active existe déjà,
 * son plaintext est irrécupérable → on la signale (`exists`) pour que l'UI
 * demande confirmation avant de la révoquer et d'en régénérer une.
 */
export async function connectAgentKey({
  userId,
  agent,
  name,
  regenerate,
}: {
  userId: string;
  agent: string;
  /** Nom d'affichage de la clé (label de l'agent, ex. "Claude Code"). */
  name: string;
  regenerate: boolean;
}): Promise<
  | { ok: true; exists: true; apiKey: ApiKeySummary }
  | { ok: true; exists: false; apiKey: ApiKeySummary; key: string }
  | { ok: false; status: number; errorKey: "databaseError" }
> {
  const service = getServiceClient();

  const { data: existing, error: findError } = await service
    .from("api_keys")
    .select(API_KEY_SUMMARY_SELECT)
    .eq("user_id", userId)
    .eq("agent", agent)
    // Ignorer les lignes « acteurs OAuth » : un grant OAuth pour le même
    // agent ne doit ni bloquer ni être révoqué par le flow clé en main.
    .is("oauth_client_id", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (findError) {
    console.error("[api-keys] agent lookup failed:", findError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  if (existing && !regenerate) {
    return { ok: true, exists: true, apiKey: existing as unknown as ApiKeySummary };
  }
  if (existing) {
    const revoked = await revokeApiKey({ userId, keyId: existing.id as string });
    if (!revoked.ok && revoked.errorKey === "databaseError") {
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  }

  const { key, hash, prefix } = generateApiKey();
  const { data, error } = await service
    .from("api_keys")
    .insert({
      user_id: userId,
      name,
      agent,
      key_hash: hash,
      key_prefix: prefix,
    })
    .select(API_KEY_SUMMARY_SELECT)
    .single();
  if (error) {
    console.error("[api-keys] agent create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, exists: false, apiKey: data as unknown as ApiKeySummary, key };
}

/**
 * Vérifie une clé Bearer mdyk_… et résout son propriétaire. Clé inconnue et
 * clé révoquée sont volontairement indistinguables (null → 401).
 */
export async function verifyApiKey(
  key: string | null | undefined
): Promise<{ userId: string; keyId: string } | null> {
  if (!key || !key.startsWith(API_KEY_PREFIX)) return null;

  const service = getServiceClient();
  const { data } = await service
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", hashApiKey(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;

  // Fire-and-forget : ne pas retarder la requête pour un horodatage d'usage.
  void service
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(({ error }) => {
      if (error) console.error("[api-keys] last_used_at:", error.message);
    });

  return { userId: data.user_id, keyId: data.id };
}
