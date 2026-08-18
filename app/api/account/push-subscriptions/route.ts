import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { deviceLabelFromUserAgent } from "@/lib/device-label";
import { assertPublicHttpUrl } from "@/lib/server/safe-fetch";
import { PUSH_DEVICE_COLUMNS } from "@/lib/server/push/columns";
import { capability } from "@/lib/server/capabilities";
import {
  parsePushRegistration,
  resolveRegistrationState,
} from "@/lib/server/push/registration";
import type { PushDevice } from "@/lib/types";

/**
 * Devices subscribed to push notifications from the calling account (MIN-183).
 *
 * Everything goes through the AUTHENTICATED client, never through the service: the RLS of
 * `push_subscriptions` (strict self-manage) guarantees ownership, where a
 * `eq("user_id", …)` written by hand would one day have been forgotten somewhere.
 * Only SENDING takes the customer service — writes to him on behalf of another.
 */

/** GET — my devices, from newest to oldest. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("push_subscriptions")
    .select(PUSH_DEVICE_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/push-subscriptions] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({
    devices: (data ?? []) as unknown as PushDevice[],
    capabilities: {
      web: capability("webPush").configured,
      apns: capability("apns").configured,
    },
  });
}

/**
 * POST — saves (or refreshes) THIS device's subscription.
 *
 * The upsert concerns `endpoint`, the business key: a browser that re-subscribes
 * MOVES his line instead of creating a second one — and if he changed accounts
 * in the meantime (shared extension), the line changes ownership instead of
 * let the old one receive notifications from the new one.
 *
 * `oldEndpoint` comes from the `pushsubscriptionchange` of the service worker: the
 * browser ran the subscription on its own, the old line does not designate
 * nothing left and must leave, otherwise the card would show the same thing twice
 * appareil.
 *
 * `refresh: true` marks calls that NO ONE requested — delivery
 * directly from the loading of the app, the spontaneous re-subscription of the browser.
 * They do not touch `enabled`: see lib/server/push/registration.ts, it is
 * all the difference between a switch that holds and one that turns back on when
 * page suivante.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const { locale, oldEndpoint, refresh } = (body ?? {}) as {
    locale?: unknown;
    oldEndpoint?: unknown;
    refresh?: unknown;
  };
  const registration = parsePushRegistration(body);
  if (!registration) {
    return NextResponse.json({ error: t("pushSubscriptionInvalid") }, { status: 400 });
  }
  const {
    endpoint: endpointValue,
    transport: selectedTransport,
    p256dh,
    auth: authSecret,
    installationId,
  } = registration;

  // A partial public configuration should not be sufficient to register a
  // device that this server will never be able to reach. This guard also precedes
  // anti-SSRF DNS resolution of the web endpoint: capacity absent = none
  // network call, even validation.
  const transportCapability = capability(
    selectedTransport === "web" ? "webPush" : "apns",
  );
  if (!transportCapability.configured) {
    return NextResponse.json(
      { error: transportCapability.diagnostic },
      { status: 503 },
    );
  }

  // An endpoint is an address that the server will CALL, each time
  // notification, forever. The browser puts that of its service
  // push ; the body of the request is written by whoever wants - hence the guard
  // anti-SSRF on the resolved address (MIN-341), in addition to https.
  if (selectedTransport === "web") {
    try {
      await assertPublicHttpUrl(endpointValue);
    } catch {
      return NextResponse.json({ error: t("pushSubscriptionInvalid") }, { status: 400 });
    }
  }

  const rotatedFrom =
    typeof oldEndpoint === "string" && oldEndpoint && oldEndpoint !== endpointValue
      ? oldEndpoint
      : null;

  // The PREVIOUS state of this device: its own line, or the one that the
  // re-subscription has just expired. The RLS only returns mine, so nothing to
  // filter further.
  const priorQuery = auth.supabase
    .from("push_subscriptions")
    .select("endpoint, enabled, locale");
  const { data: priorRows } = installationId
    ? await priorQuery.eq("native_installation_id", installationId)
    : await priorQuery.in(
        "endpoint",
        rotatedFrom ? [endpointValue, rotatedFrom] : [endpointValue]
      );
  const priorRow =
    priorRows?.find((r) => r.endpoint === endpointValue) ?? priorRows?.[0] ?? null;
  const state = resolveRegistrationState(
    priorRow
      ? { enabled: priorRow.enabled as boolean, locale: priorRow.locale as string }
      : null,
    { locale, refresh }
  );

  const now = new Date().toISOString();
  const userAgent = request.headers.get("user-agent");
  const { data, error } = await auth.supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: auth.user.id,
        endpoint: endpointValue,
        transport: selectedTransport,
        p256dh: selectedTransport === "web" ? p256dh : null,
        auth: selectedTransport === "web" ? authSecret : null,
        native_installation_id: installationId,
        // Calculated on the server side from the header: nothing to believe in a body of
        // request for a label that will be displayed as is.
        device_label: deviceLabelFromUserAgent(userAgent),
        user_agent: userAgent,
        locale: state.locale,
        // An activation lights up; a refresh respects the setting in
        // place (lib/server/push/registration.ts).
        enabled: state.enabled,
        last_seen_at: now,
        failure_count: 0,
      },
      { onConflict: "endpoint" }
    )
    .select(PUSH_DEVICE_COLUMNS)
    .single();

  if (error) {
    console.error("[api/push-subscriptions] upsert failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  if (rotatedFrom) {
    const { error: cleanupError } = await auth.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", rotatedFrom);
    // Best effort: at worst one more dead line, which the first 410 will purge.
    if (cleanupError) {
      console.error(
        "[api/push-subscriptions] cleanup of rotated endpoint failed:",
        cleanupError.message
      );
    }
  }

  if (installationId) {
    const { error: cleanupError } = await auth.supabase
      .from("push_subscriptions")
      .delete()
      .eq("native_installation_id", installationId)
      .neq("endpoint", endpointValue);
    if (cleanupError) {
      console.error("[api/push-subscriptions] cleanup of rotated APNs token failed:", cleanupError.message);
    }
  }

  return NextResponse.json({ device: data as unknown as PushDevice });
}
