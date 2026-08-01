import { NextResponse } from "next/server";

/**
 * Le SHA du déploiement qui sert VRAIMENT le trafic (MIN-157).
 *
 * Le client compare cette valeur à `NEXT_PUBLIC_GIT_COMMIT_SHA`, figée dans son
 * bundle au build (voir next.config.mjs) : un écart veut dire qu'un déploiement
 * plus récent est en ligne, et l'onglet propose de recharger.
 *
 * Pas d'authentification : le SHA du build est déjà dans le bundle client, et
 * celui de la prod est de toute façon public sur le dépôt.
 *
 * `force-dynamic` + `no-store` sont l'essentiel du contrat. Une réponse mise en
 * cache — par le CDN de Vercel ou par le navigateur — serait celle de l'ANCIEN
 * déploiement, c'est-à-dire un SHA toujours égal à celui du bundle : la
 * détection ne se déclencherait jamais.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
