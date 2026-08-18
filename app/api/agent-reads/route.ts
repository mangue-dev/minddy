import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * “Read” status of user agent sessions (“completed, unread” blue bubble).
 *  GET  → map { conversationId → last_read_at } for the user's conversations.
 * POST → marks a read conversation ({ conversationId }).
 *
 * Table `agent_conversation_reads`, strictly personal (RLS user_id = auth.uid()): the
 * Customer cookie is enough, no customer service. Non-reading occurs on the client side by
 * comparing this timestamp to the `lastCompletedAt` of the session.
 */

export const runtime = "nodejs";

// `conversation_id` is a uuid: filtering here transforms a Postgres 500 into a clean 400
// (and limits the chain in the process).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("agent_conversation_reads")
    .select("conversation_id, last_read_at")
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reads: Record<string, string> = {};
  for (const row of data ?? []) reads[row.conversation_id] = row.last_read_at;
  return NextResponse.json({ reads });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: { conversationId?: string } = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as { conversationId?: string };
  } catch {
    // invalid body → missing id, rejected below.
  }
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  if (!conversationId || !UUID_RE.test(conversationId)) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // The policy verifies both the user and their right to read the conversation.
  const { error } = await auth.supabase.from("agent_conversation_reads").upsert(
    {
      user_id: auth.user.id,
      conversation_id: conversationId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,conversation_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
