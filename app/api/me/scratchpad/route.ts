import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getScratchpad, setScratchpad } from "@/lib/server/scratchpad";
import { MAX_SCRATCHPAD_LENGTH } from "@/lib/scratchpad";

/**
 * GET /api/me/scratchpad — the user's single personal notes doc (markdown +
 * task progress). PUT replaces it. Both act *as the user* (RLS self-manage on
 * user_scratchpad), so no service client is needed.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const state = await getScratchpad(auth.supabase, auth.user.id);
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const content = (body as { content?: unknown } | null)?.content;
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }
  if (content.length > MAX_SCRATCHPAD_LENGTH) {
    return NextResponse.json({ error: "content too long" }, { status: 400 });
  }

  try {
    const state = await setScratchpad(auth.supabase, auth.user.id, content);
    return NextResponse.json(state);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
