import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun, bumpRunActivity } from "@/lib/server/agent/runs";

/**
 * Heartbeat d'une session d'agent (MIN-46). Rafraîchit `last_activity_at` tant que
 * la conversation est ouverte côté client (~toutes les 45 s), pour que le reaper ne
 * coupe pas la microVM pendant que l'utilisateur lit ou écrit. Membre du projet
 * requis. Léger — juste un bump de timestamp.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  await bumpRunActivity(runId);

  return NextResponse.json({ ok: true });
}
