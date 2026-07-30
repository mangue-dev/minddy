import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { buildAccountExport } from "@/lib/server/account-export";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * Droit d'accès et de portabilité (MIN-119, RGPD art. 15 et 20) — un seul
 * fichier JSON, téléchargé à la demande.
 *
 * Pas de file d'attente ni d'e-mail avec un lien : à cette échelle un compte
 * tient en mémoire, et une chaîne asynchrone n'ajouterait qu'un stockage
 * temporaire de plus à surveiller — c'est-à-dire de la donnée personnelle
 * supplémentaire, pour un droit dont le but est d'en garder moins.
 *
 * Ce que le fichier contient est décrit dans `lib/server/account-export.ts` ;
 * il ne porte AUCUN secret.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // Un export est une lecture large : quelques-uns par heure suffisent, et la
  // limite évite qu'une boucle côté client martèle la base.
  const limit = checkSessionRateLimit(auth.user.id, "account-export", {
    limit: 5,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many export requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let payload: Awaited<ReturnType<typeof buildAccountExport>>;
  try {
    payload = await buildAccountExport(auth.user.id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  captureServerEvent({
    distinctId: auth.user.id,
    event: "account_data_exported",
    properties: { owned_projects: payload.owned_projects.length },
  });

  const day = payload.exported_at.slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="minddy-export-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
