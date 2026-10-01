import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { NUMO_UUID } from "@/lib/server/numo/conversations";
import { ensureNumoRequestConversation } from "@/lib/server/numo/request-conversation";
import { requestNumoRequestStop } from "@/lib/server/numo/turns";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rate = checkSessionRateLimit(auth.user.id, "assistant-stop", { limit: 60 });
  if (!rate.allowed) return Response.json({ error: "Too many stop requests" }, {
    status: 429, headers: { "Retry-After": String(rate.retryAfter) },
  });
  const body = await request.json().catch(() => null) as null | {
    requestId?: unknown;
    conversationId?: unknown;
    newConversation?: unknown;
    turnId?: unknown;
  };
  if (typeof body?.requestId !== "string" || !NUMO_UUID.test(body.requestId)
    || typeof body.conversationId !== "string" || !NUMO_UUID.test(body.conversationId)
    || (body.turnId !== undefined && (typeof body.turnId !== "string" || !NUMO_UUID.test(body.turnId)))
    || (body.newConversation !== undefined && typeof body.newConversation !== "boolean")) {
    return Response.json({ error: "Invalid Numo stop identity" }, { status: 400 });
  }
  const service = getServiceClient();
  try {
    if (body.newConversation === true) {
      await ensureNumoRequestConversation({
        service, conversationId: body.conversationId, userId: auth.user.id,
      });
    } else {
      const { data, error } = await service.from("conversations").select("id")
        .eq("id", body.conversationId).eq("user_id", auth.user.id).maybeSingle();
      if (error) throw new Error("Unable to authorize Numo stop");
      if (!data) return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    let parentRequestId: string | undefined;
    if (typeof body.turnId === "string") {
      const { data: parent, error } = await service.from("numo_assistant_turns")
        .select("request_id").eq("id", body.turnId).eq("conversation_id", body.conversationId)
        .eq("user_id", auth.user.id).maybeSingle();
      if (error) throw new Error("Unable to authorize Numo execution stop");
      if (!parent) return Response.json({ error: "Execution not found" }, { status: 404 });
      parentRequestId = parent.request_id as string;
    }
    let turn = await requestNumoRequestStop({
      conversationId: body.conversationId, requestId: body.requestId, userId: auth.user.id,
    });
    if (!parentRequestId) {
      // Mediation persists the submission UUID as its parent message ID. Read
      // this association after the receipt commits; the chat route checks the
      // same receipt after mediation commits, so either side observes a race.
      const { data: message, error } = await service.from("assistant_messages")
        .select("turn_id").eq("id", body.requestId).eq("conversation_id", body.conversationId)
        .eq("role", "user").maybeSingle();
      if (error) throw new Error("Unable to resolve mediated Numo stop");
      if (message?.turn_id) {
        const { data: parent, error: parentError } = await service.from("numo_assistant_turns")
          .select("request_id").eq("id", message.turn_id).eq("conversation_id", body.conversationId)
          .eq("user_id", auth.user.id).maybeSingle();
        if (parentError || !parent) throw new Error("Unable to authorize mediated Numo stop");
        parentRequestId = parent.request_id as string;
      }
    }
    // Steering and worker answers remain part of an existing parent turn.
    // Keep the submission receipt too: if cancellation wins before mediation,
    // the same send must not fall through into a newly admitted turn.
    if (parentRequestId && parentRequestId !== body.requestId) {
      turn = await requestNumoRequestStop({
        conversationId: body.conversationId, requestId: parentRequestId, userId: auth.user.id,
      });
    }
    return Response.json({ turn_id: turn.id, status: turn.status });
  } catch (error) {
    console.error("[numo-stop] request failed:", error);
    return Response.json({ error: "Stop request failed", code: "numo_stop_failed" }, { status: 500 });
  }
}
