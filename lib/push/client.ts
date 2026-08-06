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
  const raw = window.atob(base64);
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
    // Un abonnement peut déjà exister (permission acquise à une session
    // précédente) : `subscribe` le rend tel quel si la clé n'a pas changé.
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
    const device = await savePushDeviceApi(subscription.toJSON(), locale);
    return { ok: true, device };
  } catch (e) {
    return { ok: false, reason: "failed", message: (e as Error).message };
  }
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
