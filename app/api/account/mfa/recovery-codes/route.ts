import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getMfaStatus, issueRecoveryCodes } from "@/lib/server/mfa";

/**
 * Régénère les dix codes de récupération (MIN-132). Les précédents — consommés
 * ou non — cessent immédiatement de valoir : c'est le geste qu'on fait quand on
 * ne sait plus où est la feuille, donc la remplacer à moitié n'aurait aucun sens.
 *
 * Rien à écrire pour exiger `aal2` : le garde-fou de `getAuthedUser` refuse déjà
 * toute session `aal1` sur un compte protégé.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const status = await getMfaStatus(auth.user.id);
    if (!status.enabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }
    return NextResponse.json({ recoveryCodes: await issueRecoveryCodes(auth.user.id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
