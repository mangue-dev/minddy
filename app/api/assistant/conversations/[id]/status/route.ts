import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { NUMO_UUID } from "@/lib/server/numo/conversations";
import { decodeRunEvent } from "@/lib/server/agent/run-event-store";

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
  const readPending = (columns: string) => supabase
    .from("agent_run_input_requests").select(columns)
    .eq("parent_numo_turn_id", turn!.id).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let pendingResult = turn ? await readPending(
    "run_id,parent_numo_turn_id,question_id,call_id,questions,created_at,source_event_id,encrypted_questions,questions_encryption_version"
  ) : null;
  if (pendingResult?.error &&
      process.env.MINDDY_AGENT_EVENT_ENCRYPTION_ENABLED !== "true" &&
      ["42703", "PGRST204"].includes(pendingResult.error.code)) {
    pendingResult = await readPending(
      "run_id,parent_numo_turn_id,question_id,call_id,questions,created_at");
  }
  if (pendingResult?.error) {
    return Response.json({ error: "Unable to read pending input" }, { status: 503 });
  }
  const pendingInput = pendingResult?.data as null | {
    run_id: string; parent_numo_turn_id: string; question_id: string; call_id: string;
    questions: unknown; created_at: string; source_event_id?: string | null;
    encrypted_questions?: string | null; questions_encryption_version?: number;
  };

  let readableInput: Record<string, unknown> | null = pendingInput;
  if (pendingInput && (pendingInput.questions_encryption_version ?? 0) > 0) {
    const { data: run, error } = await supabase.from("agent_runs")
      .select("project_id").eq("id", pendingInput.run_id).maybeSingle();
    if (error || !run?.project_id || !pendingInput.source_event_id ||
        !pendingInput.encrypted_questions) {
      return Response.json({ error: "Unable to read pending input" }, { status: 503 });
    }
    try {
      const event = await decodeRunEvent(run.project_id, {
        id: pendingInput.source_event_id, run_id: pendingInput.run_id,
        seq: 0, type: "question", payload: null, created_at: pendingInput.created_at,
        encrypted_content: pendingInput.encrypted_questions,
        encryption_version: pendingInput.questions_encryption_version ?? 0,
      }, auth.user.id);
      if (!Array.isArray(event.payload?.questions)) throw new Error("Invalid pending input");
      readableInput = { ...pendingInput, questions: event.payload.questions };
    } catch {
      return Response.json({ error: "Unable to read pending input" }, { status: 503 });
    }
  }
  if (readableInput) {
    delete readableInput.source_event_id;
    delete readableInput.encrypted_questions;
    delete readableInput.questions_encryption_version;
  }

  return Response.json({
    status: turn?.status ?? conversation.status,
    error_message: turn?.error_message ?? conversation.error_message,
    turn_id: turn?.id ?? null,
    last_event_seq: turn?.last_event_seq ?? -1,
    active_run_id: turn?.active_run_id ?? null,
    pending_input: readableInput ?? null,
    activity: activity ?? [],
  });
}
