import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { loadSmartAssignConfigWarnings } from "@/lib/server/smart-assign";
import type { SmartAssignWarningsResponse } from "@/lib/types";

/**
 * GET /api/me/smart-assign-warnings — mes projets où Smart Assign tourne sans
 * être réglé (MIN-31).
 *
 * Une route à part et non un champ de /api/me/summary : la sidebar porte la
 * marque sur TOUTES les pages, alors que le résumé du tableau de bord réconcilie
 * la timeline des cycles et compte les tickets — le monter partout pour une
 * pastille reviendrait à payer la lecture la plus lourde de l'app à chaque
 * navigation. Ici, deux petits `select`, et le plus souvent zéro ligne.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const body: SmartAssignWarningsResponse = {
    warnings: await loadSmartAssignConfigWarnings(auth.user.id),
  };
  return NextResponse.json(body);
}
