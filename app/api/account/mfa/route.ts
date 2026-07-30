import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { disableMfa, enableMfa, getMfaStatus, issueRecoveryCodes } from "@/lib/server/mfa";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * Second facteur du compte (MIN-132).
 *
 * L'enrôlement TOTP lui-même (QR, premier code) se joue côté client, contre
 * GoTrue : c'est la vérification du premier code qui monte la session en `aal2`,
 * et seul le SDK peut la faire. Ces routes tiennent ce que le client ne peut pas
 * tenir : le drapeau `app_metadata.mfa_enabled` que le JWT transporte (écriture
 * réservée à la clé de service) et les codes de récupération.
 *
 * Aucun champ du corps n'est cru sur parole : l'état réel se lit chez GoTrue.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await getMfaStatus(auth.user.id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Active la 2FA : constate le facteur vérifié, pose le drapeau, et renvoie les
 * dix codes de récupération — la seule fois où ils existent en clair.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const activated = await enableMfa(auth.user.id);
    if (!activated) {
      return NextResponse.json({ error: "No verified factor" }, { status: 400 });
    }
    const recoveryCodes = await issueRecoveryCodes(auth.user.id);
    captureServerEvent({
      distinctId: auth.user.id,
      event: "mfa_enabled",
      properties: {},
    });
    return NextResponse.json({ recoveryCodes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Désactive tout. Pas de confirmation par mot de passe : la session est
 * forcément `aal2` pour arriver ici (c'est le garde-fou de `getAuthedUser`), et
 * un code TOTP frais vaut mieux qu'un mot de passe recopié.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    await disableMfa(auth.user.id);
    captureServerEvent({
      distinctId: auth.user.id,
      event: "mfa_disabled",
      properties: { via: "settings" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
