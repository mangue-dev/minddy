import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import {
  NumoMemoryError,
  deleteNumoMemory,
  updateNumoMemory,
} from "@/lib/server/numo/memory-content";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rewrite one memory's text; its project scope is unchanged. */
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as { content?: unknown } | null;
  try {
    const memory = await updateNumoMemory(getServiceClient(), auth.user.id, id.toLowerCase(),
      { content: body?.content });
    return NextResponse.json({ memory });
  } catch (error) {
    if (error instanceof NumoMemoryError && error.code === "invalid_content") {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof NumoMemoryError && error.code === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not save the memory" }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const deleted = await deleteNumoMemory(getServiceClient(), auth.user.id, id.toLowerCase());
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Could not delete the memory" }, { status: 503 });
  }
}
