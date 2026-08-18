import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * The Numo OPEN conversation, server side (MIN-353).
 *
 * The messages were in base since day one; the pointer that says
 * WHICH is open, he lived in localStorage — so not from one tab to
 * the other, not from one browser to another, not from the web to the desktop app.
 *
 * The GET also returns the `project_id` of the conversation: it is he who sets the
 * brought to the restoration, otherwise the panel would fall on the project of
 * the current URL — exactly the bug we are closing.
 */

interface ActiveConversationResponse {
  conversationId: string | null;
  projectId: string | null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  // The conversation is attached for its scope. Deleting it erases the line
  // (cascade), so a non-empty response always designates a thread that exists.
  const { data } = await supabase
    .from("assistant_active_conversation")
    .select("conversation_id, conversation:conversations(project_id)")
    .eq("user_id", user.id)
    .maybeSingle();

  // PostgREST renders an OBJECT for a "to one" relationship, but the client is not
  // not typed on the diagram: the table form is accepted for security purposes rather
  // than writing a cast that would lie if it happened.
  type Embedded = { project_id: string | null };
  const embedded = data?.conversation as Embedded | Embedded[] | null | undefined;
  const conversation = Array.isArray(embedded)
    ? (embedded[0] ?? null)
    : (embedded ?? null);

  const body: ActiveConversationResponse = data
    ? {
        conversationId: data.conversation_id as string,
        projectId: conversation?.project_id ?? null,
      }
    : { conversationId: null, projectId: null };

  return Response.json(body);
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  let conversationId: string;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    const raw = (parsed as { conversationId?: unknown }).conversationId;
    // A uuid is 36 characters long — beyond 100, forged body.
    if (typeof raw !== "string" || !raw || raw.length > 100) {
      throw new Error("bad conversationId");
    }
    conversationId = raw;
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // Property verified here rather than left to the RLS alone: ​​a conversation
  // which is not its own should respond 404, not a constraint violation.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("assistant_active_conversation")
    .upsert(
      { user_id: user.id, conversation_id: conversationId },
      { onConflict: "user_id" },
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { user, supabase } = auth;

  const { error } = await supabase
    .from("assistant_active_conversation")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
