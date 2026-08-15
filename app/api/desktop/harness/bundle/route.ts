import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  harnessBundleManifest,
  harnessBundleSource,
} from "@/lib/server/agent/harness-bundle";

/**
 * `GET /api/desktop/harness/bundle` — LES OCTETS DU HARNESS (MIN-293).
 *
 * La seconde moitié de la livraison, séparée du manifeste
 * ([../route.ts](../route.ts)) pour une raison qui n'est pas de rangement : le
 * manifeste est demandé à CHAQUE tour, les octets seulement quand l'empreinte a
 * changé. Les servir ensemble ferait passer 280 Ko par tour pour deux cents
 * octets d'information utile.
 *
 * ## L'en-tête d'empreinte n'est pas la garantie
 *
 * `x-minddy-harness-sha256` est là pour que le téléchargement se vérifie sans un
 * second aller-retour, et c'est tout. **Ce qui protège vraiment est la
 * revérification sur le fichier du disque, juste avant le fork** : le bundle est
 * le seul code non signé par Apple que l'app exécute, il vit sous `userData` et
 * il est inscriptible par le modèle sous le même UID. Un contrôle qui n'aurait
 * lieu qu'au téléchargement laisserait un tour réécrire le harness du tour
 * suivant — voir [lib/desktop/harness-bundle.ts](../../../../../lib/desktop/harness-bundle.ts).
 *
 * ## `text/plain`, pas `text/javascript`
 *
 * Rien ici ne doit ressembler à un script qu'un navigateur pourrait charger. Le
 * seul client est un `fetch` du main process, qui écrit le corps sur le disque ;
 * un `content-type` exécutable et un `content-disposition` absent seraient une
 * invitation à s'en servir autrement. Le `nosniff` va avec.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let source: string;
  let sha256: string;
  try {
    [source, { sha256 }] = await Promise.all([
      harnessBundleSource(),
      harnessBundleManifest(),
    ]);
  } catch (err) {
    console.error("[desktop-harness] bundle indisponible:", (err as Error).message);
    return NextResponse.json(
      { error: "harness bundle unavailable on this deployment" },
      { status: 503 },
    );
  }

  return new NextResponse(source, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      "content-disposition": 'attachment; filename="minddy-harness.js"',
      "x-minddy-harness-sha256": sha256,
      "cache-control": "no-store",
    },
  });
}
