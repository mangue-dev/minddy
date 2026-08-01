import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { deleteAccount } from "@/lib/server/account-deletion";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * Droit à l'effacement (MIN-119, RGPD art. 17) — la personne supprime son
 * compte elle-même, sans passer par un e-mail à traiter à la main.
 *
 * Le corps doit répéter l'adresse du compte (`{ confirm }`). Ce n'est pas de
 * l'authentification — la session l'a déjà faite — mais un cran d'arrêt : un
 * DELETE part d'un clic, et celui-ci ne se rattrape pas.
 */

export const maxDuration = 60;

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: { confirm?: string };
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) : refusé ici plutôt que de crasher plus bas.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { confirm?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = auth.user.email ?? "";
  const confirm = (typeof body.confirm === "string" ? body.confirm : "")
    .trim()
    .toLowerCase();
  if (!email || confirm !== email.toLowerCase()) {
    return NextResponse.json({ error: "Confirmation mismatch" }, { status: 400 });
  }

  // Émis AVANT la suppression : après, l'identifiant ne désigne plus personne et
  // l'événement serait rattaché à un fantôme.
  captureServerEvent({ distinctId: auth.user.id, event: "account_deleted", properties: {} });

  try {
    const result = await deleteAccount(auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
