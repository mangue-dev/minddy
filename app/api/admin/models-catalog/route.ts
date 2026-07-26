import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getPlatformModelCatalog } from "@/lib/server/agent/models-catalog";

/**
 * Catalogue de modèles du dashboard admin (`/admin` → onglet « Modèles »).
 *
 * Volontairement distinct de `/api/agent/models` : celui-là résout le provider
 * ACTIF du compte (son BYOK), alors que les modèles d'`app_config` tournent
 * toujours sur la clé plateforme OpenRouter — proposer le catalogue Anthropic
 * d'un admin en BYOK ferait écrire des ids inutilisables au runtime. Et il ne
 * filtre pas sur le tool-calling, puisque la config couvre aussi la
 * transcription et les embeddings.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!isAdminUser(auth.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const models = await getPlatformModelCatalog();
  return NextResponse.json({ provider: "openrouter", defaultModel: null, models });
}
