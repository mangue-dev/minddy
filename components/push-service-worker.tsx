"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

import { refreshThisDeviceSubscription } from "@/lib/push/client";

/**
 * Mounts the push notification transport (Web Push in MIN-183, native APNs
 * in MIN-356). No rendering: this
 * component only exists for its effect, next to `<NewVersionBanner />` in
 * app providers.
 *
 * ## It ONLY registers if permission is already granted
 *
 * A service worker is a persistent, origin-wide object that the user does not see and cannot remove other than by digging through the developer tools. Someone who has never requested a
 * notification has no reason to inherit one: it would be of no use to him
 * (without permission, no push will ever happen) and it would survive the closing of the tab.
 *
 * On the web, the subscription is born in the gesture of the settings switch, where the
 * permission is asked. Here we only raise the worker for the
 * devices ALREADY subscribed — otherwise the browser, which unloads an inactive worker,
 * would no longer have anyone to receive the event `push`.
 *
 * ## And we reset the subscription plumb
 *
 * Two drifts catch up when loading, and neither signals itself:
 *
 * • the ENDPOINT turned without passing through `pushsubscriptionchange` (the worker
 * was not active, the event was lost). The base line would point
 * to a dead point;
 * • the subscription in place carries an OTHER public key than ours. On
 * `localhost`, the origin is shared between all projects on the machine
 * and a neighbor's subscription is visible from here; in production, this is what a rotation of the VAPID pair leaves behind. The push
 * service then responds 403 to each send, forever.
 *
 * `refreshThisDeviceSubscription` processes both. In the recent macOS app,
 * the same function asks the bridge for its current APNs token and associates it with the
 * authenticated session; no service worker is then registered. The upsert concerns
 * `endpoint`, so it has no effect when nothing has changed, and the old line
 * leaves with `oldEndpoint` when it was necessary to resubscribe.
 */
export function PushServiceWorker() {
  const locale = useLocale();

  useEffect(() => {
    void refreshThisDeviceSubscription(locale).catch((e) => {
      // Best effort from end to end: the app doesn't have to flinch because a
      // service worker n'a pas voulu s'enregistrer.
      console.error("[push] remise d'aplomb de l'abonnement échouée:", e);
    });
  }, [locale]);

  return null;
}
