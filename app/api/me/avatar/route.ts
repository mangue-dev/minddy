import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { fetchAvatarSeed, regenerateAvatarSeed } from "@/lib/server/avatar-seeds";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Mon avatar.
 *
 * GET  — la graine de ma marque, dont l'interface a besoin pour la dessiner
 *        (barre latérale, menu mobile, réglages). Les marques des AUTRES
 *        arrivent avec les membres du projet, jamais par ici.
 * POST — un nouveau tirage. C'est la seule prise que l'utilisateur a sur son
 *        avatar : il ne le choisit pas, il le relance.
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

  try {
    const seed = await regenerateAvatarSeed(getServiceClient(), auth.user.id);
    return NextResponse.json({ seed });
  } catch (err) {
    console.error("[me/avatar] regenerate failed:", (err as Error).message);
    return NextResponse.json({ error: "Regenerate failed" }, { status: 500 });
  }
}
