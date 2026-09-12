import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { id: conversationId } = await params;

  const { data: conversation } = await supabase
    .from("numo_conversation_history")
    .select("status, error_message")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(conversation);
}
