import type { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getNumoConversation, NUMO_UUID } from "@/lib/server/numo/conversations";

/** The pointer stores the common identity; current access is rechecked on read. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { data, error } = await auth.supabase.from("assistant_active_conversation")
    .select("conversation_id").eq("user_id", auth.user.id).maybeSingle();
  if (error) return Response.json({ error: "Unable to read active conversation" }, { status: 500 });
  try {
    const conversation = data ? await getNumoConversation(auth.supabase, data.conversation_id) : null;
    return Response.json({ conversationId: conversation?.id ?? null,
      projectId: conversation?.project_id ?? null, detailHref: conversation?.detail_href ?? null });
  } catch {
    return Response.json({ error: "Unable to read active conversation" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  let conversationId: string;
  try {
    const body = await request.json();
    if (typeof body?.conversationId !== "string" || !NUMO_UUID.test(body.conversationId)) throw new Error();
    conversationId = body.conversationId;
  } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  try {
    const conversation = await getNumoConversation(auth.supabase, conversationId);
    if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });
    const { error } = await auth.supabase.from("assistant_active_conversation").upsert(
      { user_id: auth.user.id, conversation_id: conversation.id }, { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Unable to set active conversation" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { error } = await auth.supabase.from("assistant_active_conversation")
    .delete().eq("user_id", auth.user.id);
  if (error) return Response.json({ error: "Unable to clear active conversation" }, { status: 500 });
  return new Response(null, { status: 204 });
}
