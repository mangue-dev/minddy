import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { consumeRecoveryCode, disableMfa, getMfaStatus } from "@/lib/server/mfa";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * « Je n'ai plus mon téléphone » (MIN-132) — la SEULE route servie en `aal1` sur
 * un compte protégé, et donc la seule à monter `getAuthedUser` avec
 * `allowAal1`. Il faut quand même une session valide : un code de récupération
 * n'est pas un identifiant, c'est le second facteur de quelqu'un qui a déjà
 * donné son mot de passe (ou est passé par Google / GitHub).
 *
 * Un code consommé ne délivre pas d'`aal2` — seul GoTrue peut en frapper un. Il
 * DÉSACTIVE la 2FA : les facteurs partent, le drapeau retombe, le compte
 * redevient accessible en `aal1`. C'est plus honnête qu'une élévation
 * silencieuse, et ça dit à la personne ce qu'il lui reste à faire : réactiver.
 *
 * Dix essais par minute : de quoi se tromper en recopiant, pas de quoi balayer
 * un espace de 40 bits.
 */

const RECOVERY_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request, { allowAal1: true });
  if (!auth.ok) return auth.response;

  const t = await getTranslations("ApiErrors");

  const rate = checkSessionRateLimit(auth.user.id, "mfa-recover", RECOVERY_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: t("tooManyAttempts", { seconds: rate.retryAfter }) },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: { code?: string };
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) : refusé ici, pas en 500 plus bas.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { code?: string };
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  try {
    // Un compte sans 2FA n'a rien à récupérer. On le dit tel quel : la session
    // est déjà celle de la personne, il n'y a rien à protéger par le flou.
    const status = await getMfaStatus(auth.user.id);
    if (!status.enabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    // Un code frappé fait une dizaine de caractères : bien au-delà, c'est un
    // corps forgé — inutile de le normaliser et de le hacher.
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 64) {
      return NextResponse.json({ error: t("invalidRecoveryCode") }, { status: 400 });
    }

    const consumed = await consumeRecoveryCode(auth.user.id, code);
    if (!consumed) {
      return NextResponse.json({ error: t("invalidRecoveryCode") }, { status: 400 });
    }

    await disableMfa(auth.user.id);
    captureServerEvent({
      distinctId: auth.user.id,
      event: "mfa_disabled",
      properties: { via: "recovery_code" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
