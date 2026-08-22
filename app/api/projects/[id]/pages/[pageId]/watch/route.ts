import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { clearPageWatcher, touchPageWatcher } from "@/lib/server/pages";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * POST — watch heartbeat.
 *
 * Sent every `PAGE_WATCH_PING_MS` while the editor holds this page open
 * (lib/page-watch.ts). The fresh row it leaves in `page_viewers` is what makes
 * `notifyAgentPageWrite` stay silent: someone looking at the page sees an
 * agent's write live, and the inbox line would only repeat it. Responds 404 to
 * a page that no longer exists or that the caller cannot read — a stale ping
 * must never keep a viewer row alive on a page the pinger lost access to.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const watched = await touchPageWatcher(pageId, auth.user.id);
  if (!watched) {
    return NextResponse.json({ error: "pageNotFound" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE — stop watching. Sent when the editor unmounts or the tab hides for
 * good (`keepalive`, same reason as `updatePageOnUnload`). Best-effort: a lost
 * call costs nothing, the row goes stale on its own after `PAGE_WATCH_FRESH_MS`.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  await clearPageWatcher(pageId, auth.user.id);
  return NextResponse.json({ ok: true });
}
