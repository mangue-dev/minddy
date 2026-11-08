import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { cancelNumoWatch } from "@/lib/server/numo/watches";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cancel one active reminder (MIN-923). */
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
