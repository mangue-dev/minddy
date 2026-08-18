import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun, requestInterrupt } from "@/lib/server/agent/runs";
import { stopChainOnInterrupt } from "@/lib/server/automations/hooks";

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

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // We only interrupt a run that WORKS; at rest there is nothing to interrupt.
  const working = WORKING.includes(run.status);
  if (working) {
    await requestInterrupt(runId);
  }

  // A human “stop” STOPS the chain (MIN-147), it does not move it forward:
  // it's the gesture of someone who wants it to stop, not the end of a stage. He
  // must be said HERE — the end of run hook cannot deduct it,
  // `clearInterrupt` having already cleared the flag when `stampRun` executes.
  //
  // Only if THIS run worked: open an OLD run in the chain and there
  // clicking “stop” stopped the chain while its current run continued
  // turn and push code — the bar said “stopped”, the agent was coding.
  if (run.chain_id && working) stopChainOnInterrupt(run.chain_id);

  return NextResponse.json({ ok: true, status: run.status });
}
