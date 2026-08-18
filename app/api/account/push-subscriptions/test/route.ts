import { NextResponse, type NextRequest } from "next/server";
import { createTranslator } from "next-intl";
import { getTranslations } from "next-intl/server";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { isPushConfigured } from "@/lib/server/push/vapid";
import { isApnsConfigured } from "@/lib/server/push/apns";
import { toPushLocale } from "@/lib/server/push/payload";
import { sendPushToUser } from "@/lib/server/push/send";

/**
 * POST /api/account/push-subscriptions/test — rings ONE device (MIN-183).
 *
 * Without this button, the only way to know if a device is working is to wait
 * that something is happening, then not knowing how to interpret the silence:
 * permission denied ? worker dead? notifications cut off by the system? THE
 * test turns that into an immediate response — and a 410 becomes a purge
 * visible rather than a mystery.
 *
 * The notification is sent in the language of the DEVICE, not that of the tab
 * which triggers the test: what we check is what this device will receive
 * vraiment.
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
  const { endpoint } = (body ?? {}) as { endpoint?: unknown };
  if (typeof endpoint !== "string" || !endpoint) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  // AUTHENTICATED customer for ownership verification: the RLS renders the line
  // from another untraceable account, without us having to think about it.
  const { data: device, error } = await auth.supabase
    .from("push_subscriptions")
    .select("id, transport, locale, enabled")
    .eq("endpoint", endpoint)
    .maybeSingle();

  if (error) {
    console.error("[api/push-subscriptions/test] lookup failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!device) {
    return NextResponse.json({ error: t("pushDeviceNotFound") }, { status: 404 });
  }
  const configured =
    device.transport === "apns" ? isApnsConfigured() : isPushConfigured();
  if (!configured) {
    return NextResponse.json({ error: t("pushNotConfigured") }, { status: 503 });
  }
  // `sendPushToUser` only targets active devices: a turned off device does not
  // would not ring, and the silence would read like a breakdown.
  if (!device.enabled) {
    return NextResponse.json({ error: t("pushDeviceDisabled") }, { status: 409 });
  }

  const locale = toPushLocale(device.locale as string | null);
  const tPush = createTranslator({
    locale,
    messages: locale === "fr" ? (fr as typeof en) : en,
    namespace: "Push",
  });

  // Service: it is he who is responsible for the maintenance of the fleet (purging of a 410, reconditioning
  // zero of the failure counter), and these writes do not go through the RLS.
  const tally = await sendPushToUser(
    getServiceClient(),
    auth.user.id,
    () => ({
      title: tPush("testTitle"),
      body: tPush("testBody"),
      url: "/inbox",
      tag: "minddy-test",
    }),
    { onlyEndpoint: endpoint }
  );

  if (tally.sent > 0) return NextResponse.json({ ok: true });
  // 404/410: the subscription no longer exists with the push service, and sending
  // just deleted his line. To put it bluntly — the list will move.
  if (tally.gone > 0) {
    return NextResponse.json({ error: t("pushDeviceGone") }, { status: 410 });
  }
  return NextResponse.json({ error: t("pushSendFailed") }, { status: 502 });
}
