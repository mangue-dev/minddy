import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { NUMO_UUID } from "@/lib/server/numo/conversations";
import { decodeNumoTurnEvent } from "@/lib/server/numo/turn-event-content";
import { decodeNumoError } from "@/lib/server/numo/error-content";

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
    .select("status, error_message, source, legacy_id")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { data: turn } = await supabase
    .from("numo_assistant_turns")
    .select("id, status, error_message, last_event_seq, updated_at")
    .eq("conversation_id", conversationId)
    // A pre-admission Stop receipt must not mask a newer admitted request.
    .or("status.neq.stopped,model.not.is.null,attempts.gt.0")
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
  let readableActivity;
  try {
    // Events of the retired code worker (MIN-721) are left out: nothing renders
    // them anymore.
    readableActivity = await Promise.all((activity ?? [])
      .filter((event) => !String(event.type).startsWith("worker_"))
      .map(async (event) => ({
        ...event,
        payload: await decodeNumoTurnEvent(event.payload, {
          userId: auth.user.id, turnId: turn!.id as string,
          eventId: event.id as string,
        }),
      })));
  } catch {
    return Response.json({ error: "Unable to read activity" }, { status: 503 });
  }
  return Response.json({
    status: turn?.status ?? conversation.status,
    error_message: turn?.error_message
      ? await decodeNumoError(auth.user.id, "numo_assistant_turns",
          turn.id, turn.error_message, auth.user.id)
      : await decodeNumoError(auth.user.id, "conversations",
          conversation.legacy_id, conversation.error_message, auth.user.id),
    turn_id: turn?.id ?? null,
    last_event_seq: turn?.last_event_seq ?? -1,
    activity: readableActivity,
  });
}
