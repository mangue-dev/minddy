import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { deleteAccount } from "@/lib/server/account-deletion";
import { captureServerEvent } from "@/lib/server/posthog";
import {
  REAUTH_REQUIRED_CODE,
  hasPasswordIdentity,
  isRecentlyAuthenticated,
  verifyAccountPassword,
} from "@/lib/server/reauth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * Droit à l'effacement (MIN-119, RGPD art. 17) — la personne supprime son
 * compte elle-même, sans passer par un e-mail à traiter à la main.
 *
 * Le corps doit répéter l'adresse du compte (`{ confirm }`). Ce n'est pas de
 * l'authentification — la session l'a déjà faite — mais un cran d'arrêt : un
 * DELETE part d'un clic, et celui-ci ne se rattrape pas.
 *
 * ## Et une ré-authentification par-dessus (MIN-345)
 *
 * Le cran d'arrêt protège de la maladresse, pas de quelqu'un d'autre. Ce geste
 * emporte en cascade les projets possédés, leurs tickets, leurs fichiers et
 * l'accès de leurs membres : une session ouverte trouvée sur un poste
 * déverrouillé ne doit pas suffire. On redemande donc le mot de passe, ou —
 * compte OAuth, il n'y en a pas — une authentification datant de moins d'un
 * quart d'heure. Le détail du choix est dans `lib/server/reauth.ts`.
 */

export const maxDuration = 60;

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: { confirm?: string; password?: string };
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) : refusé ici plutôt que de crasher plus bas.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { confirm?: string; password?: string };
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

  // Le débit AVANT la vérification du mot de passe : sans lui, cette route
  // devient un oracle à mots de passe pour qui tient une session volée.
  const rate = checkSessionRateLimit(auth.user.id, "account:delete", { limit: 5 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: t("tooManyAttempts", { seconds: rate.retryAfter }) },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  if (hasPasswordIdentity(auth.user.app_metadata)) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) {
      return NextResponse.json(
        { error: t("reauthPasswordRequired"), code: REAUTH_REQUIRED_CODE },
        { status: 403 }
      );
    }
    if (!(await verifyAccountPassword(email, password))) {
      return NextResponse.json({ error: t("reauthPasswordInvalid") }, { status: 403 });
    }
  } else if (!isRecentlyAuthenticated(auth.claims)) {
    return NextResponse.json(
      { error: t("reauthTooOld"), code: REAUTH_REQUIRED_CODE },
      { status: 403 }
    );
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
