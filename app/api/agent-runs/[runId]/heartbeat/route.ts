import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun, bumpRunActivity } from "@/lib/server/agent/runs";

/**
 * Heartbeat d'une session d'agent (MIN-46). Rafraîchit `last_activity_at` tant que
 * la conversation est ouverte côté client (~toutes les 45 s), pour que le reaper ne
 * coupe pas la microVM pendant que l'utilisateur lit ou écrit. Réservé à qui peut
 * lire le run (MIN-332). Léger — juste un bump de timestamp.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  await bumpRunActivity(runId);

  return NextResponse.json({ ok: true });
}
