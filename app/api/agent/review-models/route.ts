import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getPlatformModelCatalog } from "@/lib/server/agent/models-catalog";
import { getInstancePrReviewModel } from "@/lib/server/agent/pr-review-runs";

/**
 * Catalogue du picker « faire vérifier par Numo ».
 *
 * C'est celui de la clé PLATEFORME OpenRouter, et pas celui du provider actif du
 * compte (`/api/agent/models`) : la review tourne sur la clé plateforme, y
 * compris pour un compte en BYOK — lui proposer ses ids natifs (`gpt-…`,
 * `claude-…`) ferait choisir un modèle non routable, qui échouerait au premier
 * appel. Le filtre tool-calling de `getPlatformModelCatalog` est exactement ce
 * qu'il faut ici : la review est un tool call forcé.
 *
 * `defaultModel` est le réglage d'instance (`pr_review_model`, /admin) : ce vers
 * quoi pointe l'option « défaut » du picker.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const [models, defaultModel] = await Promise.all([
    getPlatformModelCatalog(),
    getInstancePrReviewModel(),
  ]);
  return NextResponse.json({ provider: "openrouter", defaultModel, models });
}
