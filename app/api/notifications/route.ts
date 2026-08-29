import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { readInboxNotifications } from "@/lib/server/inbox";

/** Terminal batch ID (MIN-118) — the inbox only displays 100 lines, and the
 gestures "all" go through `all` / `allRead`, not through a list of ids. */
const MAX_IDS = 500;

/** GET /api/notifications — the caller's notifications, hydrated for the Inbox. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const service = getServiceClient();
  const result = await readInboxNotifications({
    client: auth.supabase,
    service,
    userId: auth.user.id,
    clientIsUserScoped: true,
  });
  if (result.error) {
    console.error("[api/notifications] list failed:", result.error);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(result.notifications);
}

/**
 * PATCH /api/notifications — flip read state.
 * Body: { ids: string[] } | { all: true } to mark read, { ids, read: false }
 * to mark back unread.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const { ids, all, read } = (body ?? {}) as {
    ids?: unknown;
    all?: unknown;
    read?: unknown;
  };
  const markRead = read !== false;
  if (Array.isArray(ids) && ids.length > MAX_IDS) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  const validIds = Array.isArray(ids)
    ? ids.filter((v): v is string => typeof v === "string")
    : [];

  // RLS restricts updates to the caller's own rows.
  let query = auth.supabase
    .from("notifications")
    .update({ read_at: markRead ? new Date().toISOString() : null });
  if (markRead) query = query.is("read_at", null);
  if (all === true && markRead) {
    // no extra filter — all of my unread
  } else if (validIds.length > 0) {
    query = query.in("id", validIds);
  } else {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const { error } = await query;
  if (error) {
    console.error("[api/notifications] mark read failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/notifications — remove rows for good.
 * Body: { ids: string[] } for specific rows, { allRead: true } to clear
 * everything already read.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const { ids, allRead } = (body ?? {}) as { ids?: unknown; allRead?: unknown };
  if (Array.isArray(ids) && ids.length > MAX_IDS) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  const validIds = Array.isArray(ids)
    ? ids.filter((v): v is string => typeof v === "string")
    : [];

  // RLS restricts deletes to the caller's own rows.
  let query = auth.supabase.from("notifications").delete();
  if (allRead === true) {
    query = query.not("read_at", "is", null);
  } else if (validIds.length > 0) {
    query = query.in("id", validIds);
  } else {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const { error } = await query;
  if (error) {
    console.error("[api/notifications] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
