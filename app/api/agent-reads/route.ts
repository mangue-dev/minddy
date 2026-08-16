import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * État « lu » des sessions d'agent de l'utilisateur (bulle bleue « terminé, non lu »).
 *  GET  → carte { conversationId → last_read_at } de ses conversations.
 *  POST → marque une conversation lue ({ conversationId }).
 *
 * Table `agent_conversation_reads`, strictement perso (RLS user_id = auth.uid()) : le
 * cookie client suffit, aucun service client. La non-lecture se dérive côté client en
 * comparant ce timestamp au `lastCompletedAt` de la session.
 */

export const runtime = "nodejs";

// `conversation_id` est un uuid : filtrer ici transforme un 500 Postgres en 400 propre
// (et borne la chaîne au passage).
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
    // corps invalide → identifiant manquant, rejeté ci-dessous.
  }
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  if (!conversationId || !UUID_RE.test(conversationId)) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // La policy vérifie à la fois l'utilisateur et son droit de lire la conversation.
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
