import { NextResponse, type NextRequest } from "next/server";
import { createTranslator } from "next-intl";
import { getTranslations } from "next-intl/server";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { isPushConfigured } from "@/lib/server/push/vapid";
import { isApnsConfigured } from "@/lib/server/push/apns";
import { isWnsConfigured } from "@/lib/server/push/wns";
import { toPushLocale } from "@/lib/server/push/payload";
import { sendPushToUser } from "@/lib/server/push/send";

/**
 * POST /api/account/push-subscriptions/test — rings ONE device (MIN-183).
 *
 * Without this button, the only way to know whether a device works is to wait
 * for an event and then guess what the silence means: denied permission, a
 * stopped worker, or operating-system notification settings. This test makes
 * the result immediate, and a 410 becomes a visible purge instead of a mystery.
 *
 * The notification is sent in the language of the DEVICE, not that of the tab
 * that triggers the test: it verifies what this device will actually receive.
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
  const { deviceId } = (body ?? {}) as { deviceId?: unknown };
  if (typeof deviceId !== "string" || !deviceId) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  // Use the authenticated client for ownership verification. RLS makes a row
  // belonging to another account invisible.
  const { data: device, error } = await auth.supabase
    .from("push_subscriptions")
    .select("id, endpoint, transport, locale, enabled")
    .eq("id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("[api/push-subscriptions/test] lookup failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!device) {
    return NextResponse.json({ error: t("pushDeviceNotFound") }, { status: 404 });
  }
  const configured = device.transport === "apns"
    ? isApnsConfigured()
    : device.transport === "wns"
      ? isWnsConfigured()
      : isPushConfigured();
  if (!configured) {
    return NextResponse.json({ error: t("pushNotConfigured") }, { status: 503 });
  }
  // `sendPushToUser` only targets active devices. A disabled device would not
  // ring, and the silence would look like a delivery failure.
  if (!device.enabled) {
    return NextResponse.json({ error: t("pushDeviceDisabled") }, { status: 409 });
  }

  const locale = toPushLocale(device.locale as string | null);
  const tPush = createTranslator({
    locale,
    messages: locale === "fr" ? (fr as typeof en) : en,
    namespace: "Push",
  });

  // The service client owns delivery maintenance, including 410 purges and
  // resetting the failure counter; those writes do not go through RLS.
  const tally = await sendPushToUser(
    getServiceClient(),
    auth.user.id,
    () => ({
      title: tPush("testTitle"),
      body: tPush("testBody"),
      url: "/inbox",
      tag: "minddy-test",
    }),
    { onlyDeviceId: device.id as string }
  );

  if (tally.sent > 0) return NextResponse.json({ ok: true });
  // A 404/410 means the push service no longer has the subscription, and the
  // send just deleted its row. The refreshed list will therefore change.
  if (tally.gone > 0) {
    return NextResponse.json({ error: t("pushDeviceGone") }, { status: 410 });
  }
  return NextResponse.json({ error: t("pushSendFailed") }, { status: 502 });
}
