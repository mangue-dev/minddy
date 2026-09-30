import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun } from "@/lib/server/agent/runs";
import { listRunEvents } from "@/lib/server/agent/run-event-store";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Event flow of a run (MIN-46) for live view. `?after=<seq>` returns
 * strictly posterior events (incremental polling); without him, all.
 *
 * Read = who can read the run (MIN-332). The events are read in service key,
 * so the policy `agent_run_events_select` does not keep anything here: it is this control
 * who replaces her, and he must say the same thing as her.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId, { decode: false });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const afterParam = request.nextUrl.searchParams.get("after");
  const after = afterParam != null ? Number(afterParam) : -1;

  const service = getServiceClient();
  try {
    const events = await listRunEvents(service, run,
      Number.isFinite(after) && after >= 0
        ? { after, actorId: auth.user.id } : { actorId: auth.user.id });
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: "Unable to read run events" }, { status: 503 });
  }
}
