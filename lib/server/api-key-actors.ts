import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeApiKeyContent, type StoredApiKey } from "./api-key-content";

/**
 * Resolves the "actors" API keys of a batch of MCP events/comments to
 * { name, agent } for display ("Claude Code (mcp)" + agent logo).
 * Mandatory customer service: the RLS policy of api_keys is owner-only, or
 * everyone in the project must see who acted on an event they can read.
 * The labels are decrypted only for those event-linked IDs. Revoked keys
 * remain resolvable because their attribution rows survive.
 */
export interface ApiKeyActor {
  name: string;
  agent: string | null;
}

export async function resolveApiKeyActors(
  ids: Array<string | null | undefined>
): Promise<Map<string, ApiKeyActor>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (unique.length === 0) return new Map();

  const { data, error } = await getServiceClient()
    .from("api_keys")
    .select("*")
    .in("id", unique);
  if (error) {
    console.error("[api-key-actors] resolve failed:", error.message);
    return new Map();
  }
  return new Map(await Promise.all((data ?? []).map(async (key) => [
    key.id as string,
    await decodeApiKeyContent(key as StoredApiKey),
  ] as const)));
}
