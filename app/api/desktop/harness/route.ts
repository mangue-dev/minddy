import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { harnessBundleManifest } from "@/lib/server/agent/harness-bundle";

/**
 * `GET /api/desktop/harness` — LE MANIFESTE DU HARNESS (MIN-293).
 *
 * La première des deux surfaces par lesquelles une machine récupère le code
 * qu'elle va exécuter. Elle rend quatre nombres et deux chaînes, et c'est ce qui
 * permet de ne PAS retélécharger 280 Ko à chaque tour : le lanceur compare
 * l'empreinte à celle du fichier qu'il a déjà sous `userData`.
 *
 * ## Ce qu'elle sert, et pourquoi elle est authentifiée
 *
 * Le bundle ne porte AUCUN secret, et un test le tient
 * ([vm-bundle-secrets.test.ts](../../../../lib/server/agent/vm-bundle-secrets.test.ts)) :
 * il est écrit dans chaque microVM, où le modèle exécute du shell. L'ouvrir en
 * anonyme ne divulguerait donc rien qu'un run ne divulgue déjà. Mais il n'y a
 * aucune raison de le laisser à la portée d'un aspirateur : la seule personne
 * qui en a besoin est quelqu'un de connecté, dans l'app de bureau, sur le point
 * de jouer un tour. Un membre de plus dans la liste des choses qu'on sert au
 * monde entier est un membre de plus à défendre.
 *
 * L'app appelle avec sa session (`session.defaultSession.fetch`), donc les
 * cookies de l'origine du canal actif : c'est ce qui garantit qu'une coquille en
 * preview reçoit le harness de la preview, et non celui de la production —
 * l'origine sert le manifeste ET le bundle ET le plan de contrôle, ou aucun des
 * trois.
 *
 * ## Pas de cache
 *
 * `force-dynamic` et rien à mettre en cache : le manifeste change à chaque
 * déploiement, et une empreinte périmée ferait refuser le fork au lieu de le
 * réparer. C'est deux cents octets, demandés une fois par tour.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await harnessBundleManifest(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (err) {
    /**
     * LE BUNDLE MANQUE SUR CE DÉPLOIEMENT, et c'est une panne de build, pas une
     * erreur de l'appelant : `npm run build:agent-vm` n'a pas tourné, ou
     * `outputFileTracingIncludes` ne l'a pas embarqué. Un 503 le dit à la
     * machine, qui refuse son tour AVANT le fork et l'écrit dans son journal —
     * plutôt qu'un 500 anonyme dont personne ne saura quoi faire.
     */
    console.error("[desktop-harness] bundle indisponible:", (err as Error).message);
    return NextResponse.json(
      { error: "harness bundle unavailable on this deployment" },
      { status: 503 },
    );
  }
}
