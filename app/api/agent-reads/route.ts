import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * État « lu » des sessions d'agent de l'utilisateur (bulle bleue « terminé, non lu »).
 *  GET  → carte { issueId → last_read_at } de ses sessions consultées.
 *  POST → marque une session lue MAINTENANT ({ issueId }) — upsert last_read_at=now().
 *
 * Table `agent_session_reads`, strictement perso (RLS user_id = auth.uid()) : le
 * cookie client suffit, aucun service client. La non-lecture se dérive côté client en
 * comparant ce timestamp au `lastCompletedAt` de la session.
 */

export const runtime = "nodejs";

// `issue_id` est un uuid : filtrer ici transforme un 500 Postgres en 400 propre
// (et borne la chaîne au passage).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("agent_session_reads")
    .select("issue_id, last_read_at")
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reads: Record<string, string> = {};
  for (const row of data ?? []) reads[row.issue_id] = row.last_read_at;
  return NextResponse.json({ reads });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: { issueId?: string } = {};
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) → issueId manquant, rejeté ci-dessous.
    if (parsed && typeof parsed === "object") body = parsed as { issueId?: string };
  } catch {
    // corps invalide → issueId manquant, rejeté ci-dessous.
  }
  const issueId = typeof body.issueId === "string" ? body.issueId.trim() : "";
  if (!issueId || !UUID_RE.test(issueId)) {
    return NextResponse.json({ error: "issueId required" }, { status: 400 });
  }

  // RLS borne l'écriture à l'utilisateur courant. La FK issue_id valide l'existence
  // de l'issue ; on ne pré-vérifie pas l'accès (au pire l'utilisateur note une issue
  // qu'il ne voit plus — sans fuite : la lecture reste bornée à ses propres lignes).
  const { error } = await auth.supabase.from("agent_session_reads").upsert(
    {
      user_id: auth.user.id,
      issue_id: issueId,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,issue_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
