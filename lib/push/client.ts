"use client";

/**
 * Le côté navigateur des notifications push (MIN-183) : enregistrer le service
 * worker, demander la permission, s'abonner, se désabonner.
 *
 * Tout est isolé ici parce que tout y est PLEIN DE PIÈGES de plateforme, et
 * qu'aucun n'est visible depuis le composant qui appelle :
 *
 *   • `Notification.requestPermission()` doit partir d'un GESTE utilisateur.
 *     Safari (macOS et iOS) refuse net sinon, sans erreur lisible. D'où
 *     `subscribeThisDevice` appelée directement depuis l'`onCheckedChange` de
 *     l'interrupteur, jamais depuis un effet.
 *   • Une permission `denied` est DÉFINITIVE côté page : redemander ne
 *     rouvre aucune boîte de dialogue, la promesse rend `denied` tout de suite.
 *     Seuls les réglages du navigateur la rouvrent — c'est ce que la carte doit
 *     dire au lieu d'offrir un bouton qui ne peut rien faire.
 *   • iOS 16.4+ n'autorise le push QUE sur une PWA ajoutée à l'écran d'accueil.
 *     Dans Safari mobile, `PushManager` existe et `subscribe()` échoue : il faut
 *     tester `display-mode: standalone` AVANT de proposer quoi que ce soit.
 *   • HTTPS obligatoire, `localhost` excepté (d'où `next dev --experimental-https`).
 */

import { savePushDeviceApi } from "@/lib/push-devices-api";
import type { PushDevice } from "@/lib/types";

/** Le navigateur sait-il faire du push ? (Firefox privé, vieux Safari, non.) */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** La permission actuelle, sans rien demander. `"unsupported"` là où l'API
 *  n'existe pas — un état de plus, mais qui évite un `undefined` à traiter. */
export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** L'app tourne-t-elle en PWA installée (écran d'accueil, fenêtre autonome) ? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS ne parle pas `display-mode` avant 17 : il expose ce booléen
    // non standard, seul moyen d'y répondre à la question sur les versions qui
    // sont précisément celles où l'installation est obligatoire.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ se présente comme un Mac ; l'écran tactile le trahit.
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/** `applicationServerKey` veut des octets bruts ; VAPID se transporte en
 *  base64url. Même conversion que dans `public/sw.js` (qui ne peut pas importer). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  // `globalThis` et non `window` : identique dans le navigateur, mais la
  // fonction reste appelable depuis un test node.
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Enregistre `/sw.js` et rend son enregistrement PRÊT (`navigator.serviceWorker.ready`
 *  attend l'activation — s'abonner sur un worker encore en installation échoue). */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    // Sans ça, le navigateur peut servir le worker depuis son cache HTTP et ne
    // jamais voir la nouvelle version.
    updateViaCache: "none",
  });
  return navigator.serviceWorker.ready;
}

/** L'endpoint de l'abonnement de CET appareil, ou null s'il n'y en a pas. Sert
 *  à reconnaître « cet appareil-ci » dans la liste rendue par le serveur. */
export async function currentEndpoint(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

/**
 * L'abonnement en place porte-t-il bien NOTRE clé publique ?
 *
 * Question vitale, et invisible autrement : un `PushSubscription` scelle la clé
 * publique qui l'a créé, et le service de push refuse ensuite tout envoi signé
 * par une autre — un 403 sec, « the VAPID credentials in the authorization
 * header do not correspond to the credentials used to create the
 * subscriptions ». Rien côté navigateur ne le signale : l'abonnement paraît
 * parfaitement valide, la ligne s'affiche dans les réglages, et rien n'arrive
 * jamais.
 *
 * Deux façons d'y tomber, l'une quotidienne et l'autre rare :
 *   • en développement, `http://localhost:3000` est une origine PARTAGÉE entre
 *     tous les projets de la machine. Un abonnement laissé par un autre projet
 *     y est visible depuis minddy, permission comprise ;
 *   • en production, une rotation de la paire VAPID périme d'un coup tous les
 *     abonnements existants.
 *
 * Le repli est délibérément asymétrique : un navigateur qui n'expose pas
 * `options` (spécification plus récente que lui) rend `true`, faute de pouvoir
 * trancher — se tromper dans ce sens ne coûte qu'un 403 de temps en temps, se
 * tromper dans l'autre ferait se réabonner tout le monde à chaque chargement.
 */
export function usesOurApplicationServerKey(
  subscription: Pick<PushSubscription, "options">,
  key: string
): boolean {
  const options = subscription.options as PushSubscriptionOptions | undefined;
  if (!options) return true;
  const current = options.applicationServerKey;
  if (!current) return false; // abonnement sans clé applicative : pas le nôtre
  const theirs = new Uint8Array(current);
  const ours = urlBase64ToUint8Array(key);
  return (
    theirs.length === ours.length && theirs.every((byte, i) => byte === ours[i])
  );
}

/**
 * L'abonnement de cet appareil pour NOTRE clé, quitte à le refaire.
 *
 * Rend aussi l'endpoint périmé qu'on vient de jeter, le cas échéant : il faut
 * le transmettre au serveur pour que sa ligne parte, sans quoi la carte
 * montrerait deux fois le même appareil, dont un muet.
 */
async function subscriptionForOurKey(
  registration: ServiceWorkerRegistration,
  key: string
): Promise<{ subscription: PushSubscription; staleEndpoint?: string }> {
  const existing = await registration.pushManager.getSubscription();
  let staleEndpoint: string | undefined;

  if (existing && !usesOurApplicationServerKey(existing, key)) {
    staleEndpoint = existing.endpoint;
    // Obligatoire avant de se réabonner : `subscribe()` avec une clé
    // différente de celle en place lève `InvalidStateError`, il n'y a pas de
    // remplacement en un geste.
    await existing.unsubscribe();
  } else if (existing) {
    return { subscription: existing };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });
  return { subscription, staleEndpoint };
}

export type SubscribeFailure =
  | "unsupported"
  | "denied"
  | "needs-install"
  | "not-configured"
  | "failed";

export type SubscribeResult =
  | { ok: true; device: PushDevice }
  | { ok: false; reason: SubscribeFailure; message?: string };

/**
 * Abonne cet appareil, de bout en bout : permission → service worker →
 * `pushManager.subscribe` → enregistrement côté serveur.
 *
 * **À appeler dans le geste utilisateur**, sans `await` intermédiaire avant la
 * demande de permission (voir l'en-tête du fichier).
 */
export async function subscribeThisDevice(locale: string): Promise<SubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  // Safari iOS : hors PWA installée, `subscribe()` échoue par construction. Le
  // dire AVANT vaut mieux qu'une erreur opaque après.
  if (isIOS() && !isStandalone()) return { ok: false, reason: "needs-install" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, reason: "not-configured" };

  try {
    const registration = await registerPushServiceWorker();
    const { subscription, staleEndpoint } = await subscriptionForOurKey(
      registration,
      key
    );
    const device = await savePushDeviceApi(subscription.toJSON(), locale, {
      oldEndpoint: staleEndpoint,
    });
    return { ok: true, device };
  } catch (e) {
    return { ok: false, reason: "failed", message: (e as Error).message };
  }
}

/**
 * Remet d'aplomb l'abonnement d'un appareil DÉJÀ autorisé, au chargement de
 * l'app — sans jamais rien demander à personne.
 *
 * Rend `null` quand il n'y a rien à faire : pas de permission, pas de clé, ou
 * aucun abonnement (l'appareil a été retiré depuis les réglages — c'est un
 * choix, pas une panne, et il ne se rattrape pas tout seul).
 */
export async function refreshThisDeviceSubscription(
  locale: string
): Promise<PushDevice | null> {
  if (!isPushSupported() || Notification.permission !== "granted") return null;
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return null;

  const registration = await registerPushServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return null;

  const { subscription, staleEndpoint } = await subscriptionForOurKey(registration, key);
  return savePushDeviceApi(subscription.toJSON(), locale, {
    oldEndpoint: staleEndpoint,
    // Un rafraîchissement n'est pas une activation : le compter en gonflerait
    // l'événement d'un facteur cent (une visite = un appel).
    track: false,
  });
}

/**
 * Désabonne CET appareil côté navigateur, et retire sa ligne côté serveur.
 *
 * L'ordre compte : on lit l'endpoint AVANT `unsubscribe()`, qui le rend
 * inaccessible — sans quoi la ligne resterait en base, et la carte montrerait
 * un appareil qui ne peut plus rien recevoir.
 */
export async function unsubscribeThisDevice(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
