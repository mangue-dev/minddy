import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { NUMO_UUID } from "@/lib/server/numo/conversations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const { id: conversationId } = await params;
  if (!NUMO_UUID.test(conversationId)) {
    return Response.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const { data: conversation } = await supabase
    .from("numo_conversation_history")
    .select("status, error_message, source")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (conversation.source !== "assistant") return Response.json(conversation);

  const { data: turn } = await supabase
    .from("numo_assistant_turns")
    .select("id, status, error_message, last_event_seq, active_run_id, updated_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const afterValue = Number(new URL(request.url).searchParams.get("after") ?? -1);
  const after = Number.isSafeInteger(afterValue) && afterValue >= -1 ? afterValue : -1;
  const { data: activity } = turn
    ? await supabase
        .from("numo_turn_events")
        .select("id, seq, type, payload, created_at")
        .eq("turn_id", turn.id)
        .gt("seq", after)
        .order("seq", { ascending: true })
        .limit(200)
    : { data: [] };

  return Response.json({
    status: turn?.status ?? conversation.status,
    error_message: turn?.error_message ?? conversation.error_message,
    turn_id: turn?.id ?? null,
    last_event_seq: turn?.last_event_seq ?? -1,
    active_run_id: turn?.active_run_id ?? null,
    activity: activity ?? [],
  });
}
