"use client";

/**
 * The browser side of push notifications (MIN-183): register service
 * worker, ask permission, subscribe, unsubscribe.
 *
 * Everything is isolated here because everything is FULL OF platform TRAPS, and
 * none are visible from the component which calls:
 *
 * • `Notification.requestPermission()` must come from a user GESTURE.
 * Safari (macOS and iOS) refuses outright otherwise, without readable error. Hence
 * `subscribeThisDevice` called directly from the `onCheckedChange` of
 * the switch, never from an effect.
 * • A `denied` permission is DEFINITIVE on the page side: request again ne
 * reopens no dialog, the promise renders `denied` right away.
 * Only browser settings reopen it — that's what the card should
 * say instead of offering a button that can't do anything.
 * • iOS 16.4+ ONLY allows pushing on a PWA added to the home screen.
 * In mobile Safari, `PushManager` exists and `subscribe()` fails: you have to
 * test `display-mode: standalone` BEFORE offering anything.
 * • HTTPS required, `localhost` except (hence `next dev --experimental-https`).
 */

import { saveNativePushDeviceApi, savePushDeviceApi } from "@/lib/push-devices-api";
import { getDesktopBridge, type DesktopBridge } from "@/lib/desktop/bridge";
import { browserRuntimeConfig } from "@/lib/runtime-config-provider";
import type { PushDevice } from "@/lib/types";

function nativePushBridge(): DesktopNativePushBridge | null {
  const bridge = getDesktopBridge();
  if (
    bridge?.notificationCapabilities?.backgroundTransport == null ||
    !bridge.registerForPushNotifications
  ) {
    return null;
  }
  return bridge as DesktopNativePushBridge;
}

type DesktopNativePushBridge = DesktopBridge & {
  registerForPushNotifications: NonNullable<
    DesktopBridge["registerForPushNotifications"]
  >;
};

/** Does the browser know how to push? (Private Firefox, old Safari, no.) */
export function isPushSupported(): boolean {
  if (getDesktopBridge()) return nativePushBridge() !== null;
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The current permission, without asking anything. `"unsupported"` where the API
 * does not exist — one more state, but one that avoids a `undefined` to process. */
export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Does the app run in installed PWA (home screen, standalone window)? */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS does not speak `display-mode` before 17: it exposes this boolean
    // non-standard, only way to answer the question about the versions which
    // are precisely those where installation is mandatory.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ presents itself as a Mac; the touch screen gives it away.
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/** `applicationServerKey` wants raw bytes; VAPID is transported as
 * base64url. Same conversion as in `public/sw.js` (which cannot import). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  // `globalThis` and not `window`: identical in the browser, but the
  // fonction reste appelable depuis un test node.
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Registers `/sw.js` and makes its registration READY (`navigator.serviceWorker.ready`
 * awaits activation — subscribing on a worker still installing fails). */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    // Without this, the browser can serve the worker from its HTTP cache and not
    // never see the new version.
    updateViaCache: "none",
  });
  return navigator.serviceWorker.ready;
}

/** The subscription endpoint of THIS device, or null if there is none. Serves
 * to recognize “this device” in the list rendered by the server. */
export async function currentEndpoint(): Promise<string | null> {
  const native = nativePushBridge();
  if (native) {
    const registration = await native.registerForPushNotifications();
    return registration?.endpoint ?? null;
  }
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

/**
 * Does the existing subscription carry OUR public key?
 *
 * Vital question, and otherwise invisible: a `PushSubscription` seals the public key
 * that created it, and the push service then refuses any sending signed
 * by another — a 403 sec, “the VAPID credentials in the authorization
 * header do not correspond to the credentials used to create the
 * subscriptions”. Nothing on the browser side indicates this: the subscription appears
 * perfectly valid, the line is displayed in the settings, and nothing happens
 * ever.
 *
 * Two ways to get there, one daily and the other rare:
 * • in development, `http://localhost:3000` is a SHARED origin between
 * all projects on the machine. A subscription left by another project
 * is visible from minddy, permission included;
 * • in production, a rotation of the VAPID pair suddenly expires all
 * existing subscriptions.
 *
 * The fallback is deliberately asymmetrical: a browser which does not expose not
 * `options` (more recent specification than it) makes `true`, for lack of being able to
 * decide — being wrong in this sense only costs a 403 from time to time, se
 * making a mistake in the other would make everyone resubscribe each time loading.
 */
export function usesOurApplicationServerKey(
  subscription: Pick<PushSubscription, "options">,
  key: string
): boolean {
  const options = subscription.options as PushSubscriptionOptions | undefined;
  if (!options) return true;
  const current = options.applicationServerKey;
  if (!current) return false; // subscription without application key: not ours
  const theirs = new Uint8Array(current);
  const ours = urlBase64ToUint8Array(key);
  return (
    theirs.length === ours.length && theirs.every((byte, i) => byte === ours[i])
  );
}

/**
 * The subscription of this device for OUR key, even if it means redoing it.
 *
 * Also makes the expired endpoint that we have just thrown away, if necessary: it is necessary to
 * transmit it to the server so that its line goes, otherwise the card
 * would show the same thing twice device, including one mute.
 */
async function subscriptionForOurKey(
  registration: ServiceWorkerRegistration,
  key: string
): Promise<{ subscription: PushSubscription; staleEndpoint?: string }> {
  const existing = await registration.pushManager.getSubscription();
  let staleEndpoint: string | undefined;

  if (existing && !usesOurApplicationServerKey(existing, key)) {
    staleEndpoint = existing.endpoint;
    // Mandatory before resubscribing: `subscribe()` with a key
    // different from the one in place raises `InvalidStateError`, there is no
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
 * Subscribes this device, end to end: permission → service worker →
 * `pushManager.subscribe` → server-side registration.
 *
 * **To be called in the user gesture**, without `await` intermediate before the
 * permission request (see file header).
 */
export async function subscribeThisDevice(locale: string): Promise<SubscribeResult> {
  const native = nativePushBridge();
  if (native) {
    try {
      const registration = await native.registerForPushNotifications({ activate: true });
      if (!registration) return { ok: false, reason: "failed" };
      const device = await saveNativePushDeviceApi(
        registration.endpoint,
        registration.transport,
        registration.installationId,
        locale
      );
      return { ok: true, device };
    } catch (e) {
      return { ok: false, reason: "failed", message: (e as Error).message };
    }
  }
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  // Safari iOS: outside PWA installed, `subscribe()` fails by construction. THE
  // saying BEFORE is better than an opaque error afterwards.
  if (isIOS() && !isStandalone()) return { ok: false, reason: "needs-install" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const key = browserRuntimeConfig().vapidPublicKey;
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
 * Restores the subscription of an ALREADY authorized device, when loading
 * the app — without ever asking anyone.
 *
 * Returns `null` when there is nothing to do: no permission, no key, or
 * no subscription (the device was removed from settings — it's a
 * choice, not a failure, and it doesn't recover on its own).
 */
export async function refreshThisDeviceSubscription(
  locale: string
): Promise<PushDevice | null> {
  const native = nativePushBridge();
  if (native) {
    const registration = await native.registerForPushNotifications();
    if (!registration) return null;
    return saveNativePushDeviceApi(registration.endpoint, registration.transport, registration.installationId, locale, {
      refresh: true,
      track: false,
    });
  }
  if (!isPushSupported() || Notification.permission !== "granted") return null;
  const key = browserRuntimeConfig().vapidPublicKey;
  if (!key) return null;

  const registration = await registerPushServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return null;

  const { subscription, staleEndpoint } = await subscriptionForOurKey(registration, key);
  return savePushDeviceApi(subscription.toJSON(), locale, {
    oldEndpoint: staleEndpoint,
    // A refresh is NOT an activation, and the server must
    // know: without this flag, the call turns the line back on, and the device you
    // just turned off, turns back on at the next page load.
    refresh: true,
    // Same reason on the analytics side: one visit = one call, count it as one
    // activation would inflate the event by a factor of one hundred.
    track: false,
  });
}

/**
 * Unsubscribe THIS device on the browser side, and remove its line on the server side.
 *
 * The order matters: we read the endpoint BEFORE `unsubscribe()`, which makes it
 * inaccessible — otherwise the line would remain in base, and the map would show
 * a device that can no longer receive anything.
 */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const bridge = nativePushBridge();
  if (bridge) {
    const registration = await bridge.registerForPushNotifications();
    await bridge.unregisterForPushNotifications?.();
    return registration?.endpoint ?? null;
  }
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
