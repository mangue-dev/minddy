import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getAgentModelsForUser } from "@/lib/server/agent/models-catalog";

/**
 * Index des modèles pour le picker de l'agent (MIN-46), résolu selon le provider
 * ACTIF du compte. La logique (résolution provider, listing, cache) vit dans
 * `lib/server/agent/models-catalog.ts` — partagée avec le tool `list_agent_models`
 * de Numo. Cette route n'est plus qu'une façade HTTP authentifiée.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const catalog = await getAgentModelsForUser(auth.user.id);
  return NextResponse.json(catalog);
}
