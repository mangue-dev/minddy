import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { NUMO_UUID } from "@/lib/server/numo/conversations";
import { publicSkillsMetadata } from "@/lib/server/assistant/skills";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { id: conversationId } = await params;

  if (!NUMO_UUID.test(conversationId)) return Response.json({ error: "Invalid conversation ID" }, { status: 400 });

  // The legacy renderer only accepts assistant messages from the common identity.
  const { data: conversation } = await supabase
    .from("numo_conversation_history")
    .select("id, source, detail_href")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (conversation.source !== "assistant") {
    return Response.json({ error: "Open work detail", detailHref: conversation.detail_href }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("numo_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("source", "assistant")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(
    data?.map((message) => ({
      ...message,
      metadata: publicSkillsMetadata(message.metadata),
    })),
  );
}
