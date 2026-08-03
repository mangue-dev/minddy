import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getPrReviewModelCatalog } from "@/lib/server/agent/models-catalog";
import { getInstancePrReviewModel } from "@/lib/server/agent/model";

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
 *
 * Le plafond de modèle du plan est joint ici pour TOUT LE MONDE, BYOK compris :
 * la review se paye sur la clé plateforme, donc sur le quota minddy. Le défaut
 * d'instance, lui, échappe au plafond (cf. `resolvePrReviewModel`) — il est
 * délibérément cher, et le refuser fermerait la review aux petits plans.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const [catalog, defaultModel] = await Promise.all([
    getPrReviewModelCatalog(auth.user.id),
    getInstancePrReviewModel(),
  ]);
  return NextResponse.json({ ...catalog, defaultModel });
}
