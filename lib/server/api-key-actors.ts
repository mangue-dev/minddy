import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Resolves the "actors" API keys of a batch of MCP events/comments to
 * { name, agent } for display ("Claude Code (mcp)" + agent logo).
 * Mandatory customer service: the RLS policy of api_keys is owner-only, or
 * everyone in the project must see WHO (which agent) acted. Name + agent are
 * not secrets. Revoked keys remain resolved (row survives).
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
    .select("id, name, agent")
    .in("id", unique);
  if (error) {
    console.error("[api-key-actors] resolve failed:", error.message);
    return new Map();
  }
  return new Map(
    (data ?? []).map((k) => [
      k.id as string,
      { name: k.name as string, agent: (k.agent as string | null) ?? null },
    ])
  );
}
