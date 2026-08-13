import { NextResponse, type NextRequest } from "next/server";

import {
  desktopFeedBaseUrl,
  dmgForArch,
  isMacArch,
  parseLatestMacFeed,
} from "@/lib/desktop/update-feed";
import { posthogCookieName, readPosthogDistinctId } from "@/lib/posthog-cookie";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * `/api/desktop/download` — la porte du `.dmg` (MIN-292).
 *
 * Elle existe pour une seule raison : **aucun numéro de version ne doit être
 * écrit dans la page**. Le nom du binaire porte sa version
 * (`minddy-1.2.0-arm64.dmg`), donc un lien direct depuis `/download` obligerait
 * à retoucher `messages/en.json` et `messages/fr.json` à chaque publication — et
 * la page mentirait le jour où on oublie. Ici, elle pointe sur une URL stable,
 * et c'est le manifeste qui dit où elle mène.
 *
 * Le fichier lui-même n'est jamais servi PAR nous : on redirige vers le blob.
 * Faire transiter cent mégaoctets par une fonction serait payer du calcul pour
 * du transfert que le stockage fait mieux.
 *
 * Pas d'authentification, évidemment — c'est un téléchargement public. Et pas de
 * cache CDN sur la redirection : elle change à chaque publication, et une
 * redirection périmée envoie tout le monde sur un 404.
 *
 * ## C'est ICI qu'on compte les téléchargements
 *
 * Et pas au clic, côté navigateur. Un clic est une INTENTION — il en part aussi
 * du bandeau de l'accueil, des réglages, de la landing, et le compte des trois
 * ne dira jamais combien de `.dmg` sont réellement partis. Cette route est le
 * point de passage obligé : tout ce qui télécharge passe par elle, y compris un
 * lien collé dans un message, et elle sait ce que le clic ne sait pas — quelle
 * architecture, quelle version.
 *
 * Elle part sans condition de consentement, comme les autres événements serveur
 * (voir lib/server/posthog.ts) : aucun cookie n'est POSÉ ici. Celui de PostHog
 * est seulement LU s'il existe déjà, pour recoudre le téléchargement au reste de
 * la visite ; sinon l'événement est anonyme et ne crée aucun profil de personne.
 */

export const dynamic = "force-dynamic";

/** Le défaut, et il n'est pas neutre : tous les Mac vendus depuis 2020. */
const DEFAULT_ARCH = "arm64";

export async function GET(request: NextRequest) {
  const base = desktopFeedBaseUrl();
  if (!base) {
    return NextResponse.json(
      { error: "desktop_feed_unconfigured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const requested = request.nextUrl.searchParams.get("arch");
  const arch = isMacArch(requested) ? requested : DEFAULT_ARCH;

  // `no-store` sur la lecture du manifeste : le cache de `fetch` retiendrait la
  // version précédente pendant la fenêtre qui suit une publication, c'est-à-dire
  // exactement le moment où quelqu'un vient chercher la nouvelle.
  const response = await fetch(`${base}/latest-mac.yml`, { cache: "no-store" }).catch(
    () => null
  );
  const release = response?.ok ? parseLatestMacFeed(await response.text()) : null;
  const file = release && dmgForArch(release, arch);

  if (!file) {
    return NextResponse.json(
      { error: "desktop_release_unavailable", arch },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  captureDownload(request, { arch, version: release.version });

  return NextResponse.redirect(`${base}/${file}`, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * L'événement du téléchargement — émis seulement quand un fichier part vraiment.
 *
 * `$process_person_profile: false` dans le cas anonyme : sans lui, chaque
 * téléchargement sans cookie créerait une personne de plus dans PostHog, un
 * fantôme d'un seul événement. Le compte, lui, reste exact — c'est ce qu'on
 * cherche.
 */
function captureDownload(
  request: NextRequest,
  properties: { arch: string; version: string }
): void {
  const cookieName = posthogCookieName(process.env.NEXT_PUBLIC_POSTHOG_KEY);
  const known = cookieName
    ? readPosthogDistinctId(request.cookies.get(cookieName)?.value)
    : null;

  captureServerEvent({
    distinctId: known ?? crypto.randomUUID(),
    event: "desktop_download_started",
    properties: known ? properties : { ...properties, $process_person_profile: false },
  });
}
