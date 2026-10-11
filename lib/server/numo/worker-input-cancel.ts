import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/** Cancel only pending input for an authorized, explicitly stopped worker. */
export async function cancelStoppedWorkerInput(runId: string): Promise<void> {
  const { error } = await getServiceClient().from("agent_run_input_requests")
    .update({ status: "canceled" }).eq("run_id", runId).eq("status", "pending");
  if (error) throw new Error("Unable to cancel stopped worker input");
}
