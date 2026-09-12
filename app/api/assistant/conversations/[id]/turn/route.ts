import { NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { NUMO_UUID } from "@/lib/server/numo/conversations";
import {
  executeNumoTurn,
  requestNumoTurnStop,
  retryNumoTurn,
} from "@/lib/server/numo/turns";
import { requestInterrupt } from "@/lib/server/agent/runs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;
  const { id: conversationId } = await params;
  if (!NUMO_UUID.test(conversationId)) {
    return Response.json({ error: "Invalid conversation ID" }, { status: 400 });
  }
  const { data: conversation } = await supabase
    .from("numo_conversation_history")
    .select("id, source")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation || conversation.source !== "assistant") {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  if (body?.action === "stop") {
    const turn = await requestNumoTurnStop(conversationId, user.id);
    if (!turn) return Response.json({ error: "No active turn" }, { status: 409 });
    if (turn.active_run_id) await requestInterrupt(turn.active_run_id).catch(() => {});
    return Response.json({ turn_id: turn.id, status: turn.status });
  }
  if (body?.action === "retry") {
    const turn = await retryNumoTurn(conversationId, user.id);
    if (!turn) return Response.json({ error: "Turn is not retryable" }, { status: 409 });
    const result = await executeNumoTurn({
      turnId: turn.id,
      readClient: supabase,
      allowRetryable: true,
    });
    return Response.json({
      turn_id: turn.id,
      status: result.status === "not_claimed" ? turn.status : result.status,
    });
  }
  return Response.json({ error: "action must be 'stop' or 'retry'" }, { status: 400 });
}
