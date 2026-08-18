import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { PUSH_DEVICE_COLUMNS } from "@/lib/server/push/columns";
import type { PushDevice } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * A subscriber device, taken one by one (MIN-183): turn it on/off, or
 * remove.
 *
 * The two gestures are distinct and remain so:
 * • PATCH `enabled` CUTS sending without affecting the browser subscription — the
 * permission remains granted, the device turns back on with a click. It's the gesture
 *     “not tonight”.
 * • DELETE removes the line. It’s the “I changed phone” gesture. Nothing
 * can no longer be pushed to this endpoint, even if the opposite browser
 *     keeps its subscription (it will no longer do anything for anyone).
 *
 * AUTHENTICATED customer in both cases: the RLS verifies
 * property, and a line that doesn't belong to me is simply not found —
 * hence the 404 on zero affected lines, which does not distinguish "does not exist" from
 * “not yours”.
 */

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const { enabled } = (body ?? {}) as { enabled?: unknown };
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("push_subscriptions")
    .update({ enabled, failure_count: 0 })
    .eq("id", id)
    .select(PUSH_DEVICE_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[api/push-subscriptions] update failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: t("pushDeviceNotFound") }, { status: 404 });
  }
  return NextResponse.json({ device: data as unknown as PushDevice });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { count, error } = await auth.supabase
    .from("push_subscriptions")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    console.error("[api/push-subscriptions] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: t("pushDeviceNotFound") }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
