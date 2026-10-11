import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun, requestInterrupt, requestNumoWorkerStop } from "@/lib/server/agent/runs";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * “Interrupt the current response” of an agent session (MIN-46). Put it down
 * interrupt flag: the running chunk aborts the current LLM call (at
 * border of round or in full stream) and returns to REST. DO NOT CANCEL the
 * session, do not touch the checkpoint or the sandbox — everything remains resumable.
 * (The endpoint remains /stop on the client side.) Reserved for those who can read the run (MIN-332).
 */

type RouteContext = { params: Promise<{ runId: string }> };

const WORKING = ["queued", "running"];

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId, { decode: false });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // A delegated Stop retires Numo continuation before interrupting the selected
  // worker. The current schema combines these writes in one transaction.
  const working = WORKING.includes(run.status);
  if (working) {
    try {
      if (run.parent_numo_turn_id) await requestNumoWorkerStop(runId);
      else await requestInterrupt(runId);
    } catch {
      return NextResponse.json({ error: "Stop request failed" }, { status: 500 });
    }
    console.info("[agent-stop] recorded", {
      runId, parentTurnId: run.parent_numo_turn_id ?? null,
    });
    kickAgentDrain(getServiceClient());
  }

  return NextResponse.json({ ok: true, status: run.status });
}
