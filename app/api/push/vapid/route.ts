import { NextResponse } from "next/server";

/**
 * GET /api/push/vapid — la clé publique VAPID du serveur (MIN-183).
 *
 * PUBLIQUE, sans authentification, et c'est correct : cette clé est justement
 * celle que chaque navigateur abonné détient déjà, en clair, dans son
 * `PushSubscription`. Elle identifie le serveur, elle n'autorise rien — c'est la
 * moitié PRIVÉE qui signe les envois.
 *
 * L'unique appelant est le handler `pushsubscriptionchange` du service worker :
 * quand le navigateur fait tourner un abonnement de lui-même, le worker doit se
 * réabonner, et il n'a pas accès aux variables inlinées dans le bundle client
 * (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` n'existe que dans le code compilé de l'app).
 *
 * `key: null` quand le push n'est pas configuré — le worker s'arrête là plutôt
 * que de s'abonner avec `undefined`.
 */
export function GET() {
  return NextResponse.json({
    key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null,
  });
}
