import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/** Cancel only pending input for an authorized, explicitly stopped worker. */
export async function cancelStoppedWorkerInput(runId: string): Promise<void> {
  const { error } = await getServiceClient().from("agent_run_input_requests")
    .update({ status: "canceled" }).eq("run_id", runId).eq("status", "pending");
  if (error) throw new Error("Unable to cancel stopped worker input");
}

/** Cancel pending questions only within an authorized, stopped parent turn. */
export async function cancelStoppedTurnWorkerInputs(turnId: string): Promise<void> {
  const { error } = await getServiceClient().from("agent_run_input_requests")
    .update({ status: "canceled" }).eq("parent_numo_turn_id", turnId).eq("status", "pending");
  if (error) throw new Error("Unable to cancel worker input requests");
}
