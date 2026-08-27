"use client";

import { trackEvent } from "./analytics";
import type { PushDevice } from "./types";

/** Calls to `/api/account/push-subscriptions` (MIN-183) — same form as
 * lib/oauth-grants-api.ts: one fetch per gesture, server error reported
 * as is so that the toast says what happened. */

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
  wns: boolean;
}

export async function fetchPushDevicesApi(): Promise<{
  devices: PushDevice[];
  capabilities: PushTransportCapabilities;
}> {
  return parseJson(await fetch("/api/account/push-subscriptions"));
}

/** The platform, not the device: “MacIntel”, “iPhone”. Enough to know
 * where the activations come from, never enough to recognize someone — the
 * label and the raw user-agent remain on the server side. */
const platformProp = (): string =>
  (typeof navigator !== "undefined" && navigator.platform) || "unknown";

/**
 * Saves the subscription for this device. `subscription` is the
 * `PushSubscriptionJSON` rendered by `PushSubscription.toJSON()`.
 *
 * `oldEndpoint` only went through a re-subscription (the browser made
 * run the endpoint by itself): the old line no longer denotes anything.
 *
 * `refresh: true` tells the server that NO ONE requested this call — putting
 * back upright when the app loads. It must then not touch `enabled`,
 * otherwise each page loading restarts the device that has just been turned off.
 *
 * `track: false` goes with it, on the analytics side: this refresh goes back through here to
 * each visit, and counting it as an activation would inflate the event by a factor of one hundred.
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

/** Associates a native APNs token or WNS channel with the account. */
export async function saveNativePushDeviceApi(
  endpoint: string,
  transport: "apns" | "wns",
  installationId: string,
  locale: string,
  opts: { track?: boolean; refresh?: boolean } = {}
): Promise<PushDevice> {
  const { device } = await parseJson<{ device: PushDevice }>(
    await fetch("/api/account/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transport,
        endpoint,
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

export async function testPushDeviceApi(deviceId: string): Promise<void> {
  await parseJson(
    await fetch("/api/account/push-subscriptions/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    })
  );
  trackEvent("push_test_sent", {});
}
