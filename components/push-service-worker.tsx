"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

import { refreshThisDeviceSubscription } from "@/lib/push/client";

/**
 * Monte le transport des notifications push (Web Push en MIN-183, APNs natif
 * en MIN-356). Aucun rendu : ce
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
 * Sur le web, l'abonnement naît dans le geste de l'interrupteur des réglages, où la
 * permission se demande. Ici on ne fait que remonter le worker pour les
 * appareils DÉJÀ abonnés — sinon le navigateur, qui décharge un worker inactif,
 * n'aurait plus personne pour recevoir l'événement `push`.
 *
 * ## Et on remet l'abonnement d'aplomb
 *
 * Deux dérives se rattrapent au chargement, et aucune ne se signale d'elle-même :
 *
 *   • l'ENDPOINT a tourné sans passer par `pushsubscriptionchange` (le worker
 *     n'était pas actif, l'événement s'est perdu). La ligne en base pointerait
 *     sur un endpoint mort ;
 *   • l'abonnement en place porte une AUTRE clé publique que la nôtre. Sur
 *     `localhost`, l'origine est partagée entre tous les projets de la machine
 *     et l'abonnement d'un voisin est visible d'ici ; en production, c'est ce
 *     qu'une rotation de la paire VAPID laisse derrière elle. Le service de push
 *     répond alors 403 à chaque envoi, éternellement.
 *
 * `refreshThisDeviceSubscription` traite les deux. Dans l'app macOS récente,
 * la même fonction demande au pont son token APNs courant et l'associe à la
 * session authentifiée ; aucun service worker n'est alors enregistré. L'upsert porte sur
 * `endpoint`, donc c'est sans effet quand rien n'a bougé, et l'ancienne ligne
 * part avec `oldEndpoint` quand il a fallu se réabonner.
 */
export function PushServiceWorker() {
  const locale = useLocale();

  useEffect(() => {
    void refreshThisDeviceSubscription(locale).catch((e) => {
      // Best-effort de bout en bout : l'app n'a pas à broncher parce qu'un
      // service worker n'a pas voulu s'enregistrer.
      console.error("[push] remise d'aplomb de l'abonnement échouée:", e);
    });
  }, [locale]);

  return null;
}
