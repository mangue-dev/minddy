import "server-only";

import type { WebPushError } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

import { configureWebPush } from "./vapid";
import { sendApnsNotification } from "./apns";
import { sendWnsNotification } from "./wns";
import { toPushLocale, type PushLocale, type PushPayload } from "./payload";
import { sendPinnedWebPushNotification } from "./web";

/**
 * Web Push delivery and the related subscription maintenance (MIN-183).
 *
 * ## The contract: never throw
 *
 * This has the same contract as `insertNotifications`: log and swallow. An unreachable
 * push service must not fail the comment that triggered it or the automation cascade
 * containing it.
 *
 * ## Subscriptions DIE, and that's normal
 *
 * A subscription has no announced end of life. The user can uninstall the PWA,
 * revoke permission, or delete site data, after which the endpoint permanently
 * responds with 404 or 410. Without purging, the table would accumulate dead rows
 * that settings still present as active devices and every event would keep trying.
 * Purging therefore happens here, when the push service reports it.
 *
 * Other status codes deliberately have different handling:
 * - 403 means the signature was refused because the VAPID keys changed beneath
 *   the subscription. The device is not dead; deleting it would erase evidence.
 * - 413 means the payload is too large, which is a construction bug, not a device issue.
 * - 429 and 5xx are transient. Count the failure and keep the subscription.
 *
 * ## Bounded concurrency
 *
 * A person can have ten devices and a notification insert can concern ten people.
 * One unbounded `Promise.all` could open a hundred outbound requests from a single
 * serverless invocation. Five at a time keeps the tail controlled.
 */

/** The device fields needed for delivery. */
export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  transport?: "web" | "apns" | "wns";
  p256dh: string | null;
  auth: string | null;
  locale: string | null;
}

const CONCURRENCY = 5;

/**
 * After 24 hours an inbox notification is stale. A device returning three days
 * later should not receive a burst of old alerts.
 */
const TTL_SECONDS = 60 * 60 * 24;

/** The delivery outcome exposed to callers. */
export type PushSendOutcome = "sent" | "gone" | "failed" | "skipped";

const statusOf = (e: unknown): number | null => {
  const status = (e as WebPushError | undefined)?.statusCode;
  return typeof status === "number" ? status : null;
};

/**
 * Delivers to one device and maintains its row: success updates the timestamp and
 * resets failures, a dead subscription is removed, and transient failures increment.
 */
async function sendToSubscription(
  service: SupabaseClient,
  sub: PushSubscriptionRow,
  payload: PushPayload
): Promise<PushSendOutcome> {
  if (sub.transport === "apns") {
    const response = await sendApnsNotification(sub.endpoint, payload);
    if (response.status === 200) {
      await service
        .from("push_subscriptions")
        .update({ last_push_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", sub.id);
      return "sent";
    }
    if (
      response.status === 410 ||
      response.reason === "BadDeviceToken" ||
      response.reason === "Unregistered"
    ) {
      await service.from("push_subscriptions").delete().eq("id", sub.id);
      return "gone";
    }
    console.error(
      `[push/apns] delivery failed (${response.status || "no status"}): ${response.reason ?? "unknown reason"}`
    );
    await incrementFailureCount(service, sub.id);
    return "failed";
  }

  if (sub.transport === "wns") {
    const response = await sendWnsNotification(sub.endpoint, payload, TTL_SECONDS);
    if (response.status === 200) {
      await service
        .from("push_subscriptions")
        .update({ last_push_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", sub.id);
      return "sent";
    }
    if (response.status === 404 || response.status === 410) {
      await service.from("push_subscriptions").delete().eq("id", sub.id);
      return "gone";
    }
    console.error(
      `[push/wns] delivery failed (${response.status || "no status"}): ${response.reason ?? "unknown reason"}`
    );
    await incrementFailureCount(service, sub.id);
    return "failed";
  }

  if (!configureWebPush() || !sub.p256dh || !sub.auth) return "skipped";
  try {
    await sendPinnedWebPushNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: TTL_SECONDS, urgency: "normal" }
    );
    await service
      .from("push_subscriptions")
      .update({ last_push_at: new Date().toISOString(), failure_count: 0 })
      .eq("id", sub.id);
    return "sent";
  } catch (e) {
    const status = statusOf(e);

    if (status === 404 || status === 410) {
      // The subscription no longer exists with the push service. Nothing to repair:
      // the line will never again designate a reachable device.
      await service.from("push_subscriptions").delete().eq("id", sub.id);
      return "gone";
    }

    if (status === 403) {
      console.error(
        "[push] push service returned 403: this subscription no longer matches " +
          "the configured VAPID keys. The device must subscribe again."
      );
      return "failed";
    }

    console.error(
      `[push] delivery failed (${status ?? "no status"}):`,
      (e as Error).message
    );
    // `failure_count + 1` without RPC: the value read may be out of date, but
    // this is a maintenance indicator, not a transactional counter.
    await incrementFailureCount(service, sub.id);
    return "failed";
  }
}

async function incrementFailureCount(service: SupabaseClient, id: string): Promise<void> {
  const { data } = await service
    .from("push_subscriptions")
    .select("failure_count")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  await service
    .from("push_subscriptions")
    .update({ failure_count: ((data.failure_count as number) ?? 0) + 1 })
    .eq("id", id);
}

/** Runs tasks in waves of `CONCURRENCY`. */
async function inBatches<T>(
  tasks: readonly (() => Promise<T>)[],
  size = CONCURRENCY
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    out.push(...(await Promise.all(tasks.slice(i, i + size).map((task) => task()))));
  }
  return out;
}

/**
 * An account's active devices. The service client reads on another user's behalf,
 * outside any authenticated request.
 */
export async function activeSubscriptionsOf(
  service: SupabaseClient,
  userId: string
): Promise<PushSubscriptionRow[]> {
  const { data, error } = await service
    .from("push_subscriptions")
    .select("id, endpoint, transport, p256dh, auth, locale")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (error) {
    console.error("[push] failed to read subscriptions:", error.message);
    return [];
  }
  return (data ?? []) as PushSubscriptionRow[];
}

/**
 * Pushes to all active devices in an account.
 *
 * `payloadFor` is called once per language rather than once per device. Two phones
 * using the same locale share the wording and one next-intl formatter. Returning
 * `null` for a disappeared target sends nothing for that language.
 */
export async function sendPushToUser(
  service: SupabaseClient,
  userId: string,
  payloadFor: (locale: PushLocale) => PushPayload | null,
  opts: { onlyDeviceId?: string } = {}
): Promise<{ sent: number; gone: number; failed: number }> {
  const tally = { sent: 0, gone: 0, failed: 0 };
  let subs = await activeSubscriptionsOf(service, userId);
  if (opts.onlyDeviceId) {
    subs = subs.filter((subscription) => subscription.id === opts.onlyDeviceId);
  }
  if (subs.length === 0) return tally;

  const payloads = new Map<PushLocale, PushPayload | null>();
  const payloadCached = (locale: PushLocale): PushPayload | null => {
    if (!payloads.has(locale)) payloads.set(locale, payloadFor(locale));
    return payloads.get(locale) ?? null;
  };

  const tasks = subs.flatMap((sub) => {
    const payload = payloadCached(toPushLocale(sub.locale));
    if (!payload) return [];
    return [() => sendToSubscription(service, sub, payload)];
  });

  for (const outcome of await inBatches(tasks)) {
    if (outcome === "sent") tally.sent++;
    else if (outcome === "gone") tally.gone++;
    else if (outcome === "failed") tally.failed++;
  }
  return tally;
}
