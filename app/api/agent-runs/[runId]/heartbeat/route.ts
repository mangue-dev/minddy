import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun, bumpRunActivity } from "@/lib/server/agent/runs";

/**
 * Heartbeat of an agent session (MIN-46). Refreshes `last_activity_at` as long as
 * the conversation is opened on the client side (~every 45 s), so that the reaper does not
 * does not shut down the microVM while the user is reading or writing. Reserved for who can
 * read the run (MIN-332). Light — just a timestamp bump.
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
