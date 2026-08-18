import "server-only";

import webpush, { type WebPushError } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

import { configureWebPush } from "./vapid";
import { sendApnsNotification } from "./apns";
import { toPushLocale, type PushLocale, type PushPayload } from "./payload";

/**
 * Web Push sending, and the maintenance of the subscription base that goes with it (MIN-183).
 *
 * ## The contract: never throw
 *
 * Same contract as `insertNotifications` — we log, we swallow. An unreachable push
 * service must not fail the comment that triggered it, nor the
 * cascade of automations in which it runs.
 *
 * ## Subscriptions DIE, and that's normal
 *
 * A subscription has no announced end of life: the user uninstalls the
 * PWA, revokes the permission, deletes the site data — and the endpoint responds
 * then 404 or 410, definitively. Without purging, the table would accumulate dead rows which the settings map would show as active devices, and which would continue to be pushed on each event. The purge is therefore done HERE,
 * at the moment when the push service tells us: this is the only place that
 * learns it.
 *
 * The other codes are not treated the same, and that is the point:
 * • 403 → the SIGNATURE is refused: the VAPID keys have changed under the subscriptions. It's not the device that died, it's us
 * who broke the link — deleting would erase the evidence.
 * • 413 → payload too big. A manufacturing bug, not a device.
 * • 429 ​​/ 5xx → transient. We count, we keep, it will come back.
 *
 * ## Bounded competition
 *
 * Someone can have ten devices, and an insert can concern ten people.
 * A `Promise.all` on the entire product would open a hundred requests outgoing from a
 * shot from a lambda. Five at a time are more than enough and hold the
 * short tail.
 */

/** What the table stores of a device, reduced to what the send needs. */
export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  transport?: "web" | "apns";
  p256dh: string | null;
  auth: string | null;
  locale: string | null;
}

const CONCURRENCY = 5;

/** 24 hours: beyond that, an inbox notification is no longer of interest — the device which
 * turns back on three days later does not have to receive a burst from the day before. */
const TTL_SECONDS = 60 * 60 * 24;

/** The outcome of a send to a device, as the caller can read it. */
export type PushSendOutcome = "sent" | "gone" | "failed" | "skipped";

const statusOf = (e: unknown): number | null => {
  const status = (e as WebPushError | undefined)?.statusCode;
  return typeof status === "number" ? status : null;
};

/**
 * A send, to a device. Updates the row based on the outcome: success →
 * timestamp and failure counter reset to zero; subscription dead → the line
 * disappears; transient failure → counter goes up.
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
      `[push/apns] envoi échoué (${response.status || "sans statut"}): ${response.reason ?? "raison inconnue"}`
    );
    await incrementFailureCount(service, sub.id);
    return "failed";
  }

  if (!configureWebPush() || !sub.p256dh || !sub.auth) return "skipped";
  try {
    await webpush.sendNotification(
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
        "[push] 403 du service de push — clés VAPID désaccordées de cet abonnement " +
          "(la paire a-t-elle changé ?). L'appareil devra se réabonner."
      );
      return "failed";
    }

    console.error(
      `[push] envoi échoué (${status ?? "sans statut"}):`,
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

/** The active devices of an account. Client SERVICE: we read on behalf of
 * someone else, outside of any authenticated request. */
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
    console.error("[push] lecture des abonnements échouée:", error.message);
    return [];
  }
  return (data ?? []) as PushSubscriptionRow[];
}

/**
 * Pushes to all active devices in an account.
 *
 * `payloadFor` is called by LANGUAGE and not by device: the wording is the
 * even for two phones in French, and it costs a trainer
 * next-intl. Making `null` (target disappeared) sends nothing for that language.
 */
export async function sendPushToUser(
  service: SupabaseClient,
  userId: string,
  payloadFor: (locale: PushLocale) => PushPayload | null,
  opts: { onlyEndpoint?: string } = {}
): Promise<{ sent: number; gone: number; failed: number }> {
  const tally = { sent: 0, gone: 0, failed: 0 };
  let subs = await activeSubscriptionsOf(service, userId);
  if (opts.onlyEndpoint) {
    subs = subs.filter((s) => s.endpoint === opts.onlyEndpoint);
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
