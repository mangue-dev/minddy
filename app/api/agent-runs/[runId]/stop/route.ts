import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun, requestInterrupt } from "@/lib/server/agent/runs";
import { getServiceClient } from "@/lib/supabase-service";
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

  // A worker delegated by Numo (MIN-599) is stoppable INDIVIDUALLY: the read
  // gate above is the same boundary as the worker's own conversation, and the
  // interrupt only asks the worker to rest — Numo keeps its turn and resumes
  // when the delegation result flows back. Steering stays Numo-mediated
  // (`workerOwnedByNumo` on /steer); stopping is not steering.

  // We only interrupt a run that WORKS; at rest there is nothing to interrupt.
  const working = WORKING.includes(run.status);
  if (working) {
    await requestInterrupt(runId);
    // The executor keeps a run alive when an UNCONSUMED message remains (it
    // re-queues instead of resting) — the composer's steer-then-interrupt pair
    // relies on it for a STANDALONE conversation, which must keep reading its
    // message. A Numo worker has no such pairing — its steering is queued
    // directly on the run by `steer_numo_worker` — so an individual stop
    // SWALLOWS it, like the conversation-wide stop RPC does: without this, the
    // stop would answer ok while the worker carried on with a stale steer.
    if (run.parent_numo_turn_id) {
      await getServiceClient()
        .from("agent_run_messages")
        .update({ consumed_at: new Date().toISOString() })
        .eq("run_id", runId)
        .is("consumed_at", null);
    }
    // Make the stop IMMEDIATE where a poll would delay it (PR 304 reference):
    // a run interrupted while QUEUED would otherwise rest only on the next
    // drain tick — the kick claims it right away and the interrupt path stamps
    // it at rest, which also delivers the delegation result to a waiting Numo
    // turn in the same gesture. A RUNNING run keeps its own 5 s VM beat.
    kickAgentDrain(getServiceClient());
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
