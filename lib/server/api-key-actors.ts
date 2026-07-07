import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Résout les clés API « acteurs » d'un lot d'événements/commentaires MCP en
 * { name, agent } pour l'affichage (« Claude Code (mcp) » + logo de l'agent).
 * Service client obligatoire : la policy RLS d'api_keys est owner-only, or
 * tout membre du projet doit voir QUI (quel agent) a agi. Nom + agent ne sont
 * pas des secrets. Les clés révoquées restent résolues (la ligne survit).
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
