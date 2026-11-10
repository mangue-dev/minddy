import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import {
  NumoWatchError,
  cancelNumoWatch,
  pauseNumoWatch,
  resumeNumoWatch,
} from "@/lib/server/numo/watches";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cancel one reminder the user keeps, active or paused (MIN-923). */
export async function DELETE(request: NextRequest, context: Context) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const canceled = await cancelNumoWatch(getServiceClient(), auth.user.id, id.toLowerCase());
    return canceled
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Could not cancel the reminder" }, { status: 503 });
  }
}

/** Pause or resume one recurring reminder (MIN-953): `{ paused: boolean }`. */
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { paused?: unknown } | null;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (typeof body?.paused !== "boolean") {
    return NextResponse.json({ error: "paused must be a boolean", code: "invalid" }, { status: 400 });
  }
  try {
    const service = getServiceClient();
    const done = body.paused
      ? await pauseNumoWatch(service, auth.user.id, id.toLowerCase())
      : !!(await resumeNumoWatch(service, auth.user.id, id.toLowerCase()));
    return done
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
  } catch (error) {
    if (error instanceof NumoWatchError &&
        (error.code === "limit_reached" || error.code === "recurring_limit_reached")) {
      return NextResponse.json({ error: "Too many active reminders", code: error.code }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not change the reminder", code: "unavailable" }, { status: 503 });
  }
}
