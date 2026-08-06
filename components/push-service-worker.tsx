"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

import { savePushDeviceApi } from "@/lib/push-devices-api";
import { isPushSupported, registerPushServiceWorker } from "@/lib/push/client";

/**
 * Monte le service worker des notifications push (MIN-183). Aucun rendu : ce
 * composant n'existe que pour son effet, à côté de `<NewVersionBanner />` dans
 * les providers de l'app.
 *
 * ## Il ne s'enregistre QUE si la permission est déjà accordée
 *
 * Un service worker est un objet persistant, à l'échelle de l'origine, que
 * l'utilisateur ne voit pas et ne peut pas retirer autrement qu'en fouillant
 * les outils de développement. Quelqu'un qui n'a jamais demandé de
 * notifications n'a aucune raison d'en hériter un : il ne lui servirait à rien
 * (sans permission, aucun push n'arrivera jamais) et il survivrait à la
 * fermeture de l'onglet.
 *
 * L'abonnement, lui, naît dans le geste de l'interrupteur des réglages, où la
 * permission se demande. Ici on ne fait que remonter le worker pour les
 * appareils DÉJÀ abonnés — sinon le navigateur, qui décharge un worker inactif,
 * n'aurait plus personne pour recevoir l'événement `push`.
 *
 * ## Et on rattrape la rotation d'endpoint
 *
 * Le navigateur peut renouveler un abonnement sans passer par
 * `pushsubscriptionchange` (le worker n'était pas actif, l'événement s'est
 * perdu). La ligne en base pointerait alors sur un endpoint mort, et l'appareil
 * cesserait de recevoir quoi que ce soit en le disant nulle part. Un re-POST au
 * chargement le remet d'aplomb : l'upsert porte sur `endpoint`, donc c'est sans
 * effet quand rien n'a bougé, et l'ancienne ligne part quand quelque chose a
 * bougé.
 */
export function PushServiceWorker() {
  const locale = useLocale();

  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission !== "granted") return;

    let cancelled = false;
    void (async () => {
      try {
        const registration = await registerPushServiceWorker();
        const subscription = await registration.pushManager.getSubscription();
        // Permission accordée mais plus d'abonnement : l'utilisateur l'a retiré
        // depuis la carte des réglages, ou vidé les données du site. Rien à
        // rétablir sans son geste — le worker reste, muet.
        if (!subscription || cancelled) return;
        // Rafraîchit `last_seen_at` au passage : la carte peut dire quand
        // l'appareil s'est manifesté pour la dernière fois.
        await savePushDeviceApi(subscription.toJSON(), locale, { track: false });
      } catch (e) {
        // Best-effort de bout en bout : l'app n'a pas à broncher parce qu'un
        // service worker n'a pas voulu s'enregistrer.
        console.error("[push] enregistrement du service worker échoué:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  return null;
}
