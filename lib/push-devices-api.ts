"use client";

import { trackEvent } from "./analytics";
import type { PushDevice } from "./types";

/** Appels à `/api/account/push-subscriptions` (MIN-183) — même forme que
 *  lib/oauth-grants-api.ts : un fetch par geste, l'erreur du serveur remontée
 *  telle quelle pour que le toast dise ce qui s'est passé. */

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export interface PushTransportCapabilities {
  web: boolean;
  apns: boolean;
}

export async function fetchPushDevicesApi(): Promise<{
  devices: PushDevice[];
  capabilities: PushTransportCapabilities;
}> {
  return parseJson(await fetch("/api/account/push-subscriptions"));
}

/** La plateforme, pas l'appareil : « MacIntel », « iPhone ». Assez pour savoir
 *  d'où viennent les activations, jamais assez pour reconnaître quelqu'un — le
 *  libellé et le user-agent brut, eux, restent côté serveur. */
const platformProp = (): string =>
  (typeof navigator !== "undefined" && navigator.platform) || "unknown";

/**
 * Enregistre l'abonnement de cet appareil. `subscription` est le
 * `PushSubscriptionJSON` rendu par `PushSubscription.toJSON()`.
 *
 * `oldEndpoint` n'est passé que par un ré-abonnement (le navigateur a fait
 * tourner l'endpoint tout seul) : l'ancienne ligne ne désigne plus rien.
 *
 * `refresh: true` dit au serveur que PERSONNE n'a demandé cet appel — la remise
 * d'aplomb au chargement de l'app. Il ne doit alors pas toucher à `enabled`,
 * sans quoi chaque chargement de page rallume l'appareil qu'on vient d'éteindre.
 *
 * `track: false` va avec, côté analytics : ce rafraîchissement repasse par ici à
 * chaque visite, et le compter comme une activation gonflerait l'événement d'un
 * facteur cent.
 */
export async function savePushDeviceApi(
  subscription: PushSubscriptionJSON,
  locale: string,
  opts: { oldEndpoint?: string; track?: boolean; refresh?: boolean } = {}
): Promise<PushDevice> {
  const { device } = await parseJson<{ device: PushDevice }>(
    await fetch("/api/account/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        locale,
        oldEndpoint: opts.oldEndpoint,
        refresh: opts.refresh,
      }),
    })
  );
  if (opts.track !== false) {
    trackEvent("push_device_enabled", { platform: platformProp() });
  }
  return device;
}

/** Associe au compte le token APNs rendu par la coquille macOS signée. */
export async function saveNativePushDeviceApi(
  token: string,
  installationId: string,
  locale: string,
  opts: { track?: boolean; refresh?: boolean } = {}
): Promise<PushDevice> {
  const { device } = await parseJson<{ device: PushDevice }>(
    await fetch("/api/account/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transport: "apns",
        endpoint: `apns:${token}`,
        installationId,
        locale,
        refresh: opts.refresh,
      }),
    })
  );
  if (opts.track !== false) {
    trackEvent("push_device_enabled", { platform: platformProp() });
  }
  return device;
}

export async function setPushDeviceEnabledApi(
  deviceId: string,
  enabled: boolean
): Promise<PushDevice> {
  const { device } = await parseJson<{ device: PushDevice }>(
    await fetch(`/api/account/push-subscriptions/${encodeURIComponent(deviceId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
  );
  if (enabled) trackEvent("push_device_enabled", { platform: platformProp() });
  else trackEvent("push_device_disabled", {});
  return device;
}

export async function deletePushDeviceApi(deviceId: string): Promise<void> {
  await parseJson(
    await fetch(`/api/account/push-subscriptions/${encodeURIComponent(deviceId)}`, {
      method: "DELETE",
    })
  );
  trackEvent("push_device_removed", {});
}

export async function testPushDeviceApi(endpoint: string): Promise<void> {
  await parseJson(
    await fetch("/api/account/push-subscriptions/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    })
  );
  trackEvent("push_test_sent", {});
}
