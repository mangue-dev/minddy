import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { readAgentLiveSnapshot } from "@/lib/server/agent/live-snapshot";
import { getRun } from "@/lib/server/agent/runs";

type RouteContext = { params: Promise<{ runId: string }> };

/** Read current protected live state under the same authorization as events. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const run = await getRun(runId, { decode: false });
  if (!run || !(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  try {
    const snapshot = await readAgentLiveSnapshot({
      projectId: run.project_id, runId, actorId: auth.user.id,
    });
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to read live state" }, { status: 503 });
  }
}
