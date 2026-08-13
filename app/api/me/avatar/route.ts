import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  claimAvatarSeed,
  fetchAvatarSeed,
  regenerateAvatarSeed,
} from "@/lib/server/avatar-seeds";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Mon avatar.
 *
 * GET  — la graine de ma marque, dont l'interface a besoin pour la dessiner
 *        (barre latérale, menu mobile, réglages). Les marques des AUTRES
 *        arrivent avec les membres du projet, jamais par ici.
 * POST — un nouveau tirage. C'est la seule prise que l'utilisateur a sur son
 *        avatar : il ne le choisit pas, il le relance.
 *        Avec un `{ seed }` dans le corps, c'est l'ADOPTION du tirage fait
 *        pendant l'inscription (MIN-300) : le wizard a montré une marque avant
 *        qu'aucun compte n'existe, et la pose ici dès qu'il a une session. Elle
 *        n'écrase jamais une marque déjà en place — voir `claimAvatarSeed`.
 *
 * La table n'a aucune policy RLS, donc tout passe par la clé de service, et
 * `getAuthedUser` garantit qu'on ne touche qu'à SON compte : l'identifiant vient
 * du JWT vérifié, jamais du corps de la requête.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const seed = await fetchAvatarSeed(getServiceClient(), auth.user.id);
  return NextResponse.json({ seed });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { seed?: unknown } | null;
  const claimed = typeof body?.seed === "string" ? body.seed : null;

  try {
    const service = getServiceClient();
    if (claimed) {
      await claimAvatarSeed(service, auth.user.id, claimed);
      // On relit plutôt que de renvoyer ce qu'on a proposé : si le compte avait
      // déjà une marque, c'est elle qui vaut, et l'interface doit la voir.
      return NextResponse.json({ seed: await fetchAvatarSeed(service, auth.user.id) });
    }
    const seed = await regenerateAvatarSeed(service, auth.user.id);
    return NextResponse.json({ seed });
  } catch (err) {
    console.error("[me/avatar] regenerate failed:", (err as Error).message);
    return NextResponse.json({ error: "Regenerate failed" }, { status: 500 });
  }
}
