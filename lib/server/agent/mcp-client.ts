import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import { executeMcpTool } from "@/lib/server/mcp-client";
import { runSteeredByOther, type AgentRun } from "./runs";

/** Resolve from trusted run/project records, never model arguments or billing input. */
export async function executeAgentMcpTool(
  run: AgentRun,
  name: string,
  args: Record<string, unknown>,
) {
  let userId = run.created_by;
  if (run.routine_id) {
    const { data, error } = await getServiceClient()
      .from("projects")
      .select("owner_id")
      .eq("id", run.project_id)
      .is("deleted_at", null)
      .maybeSingle();
    // Ownership transfers invalidate the old owner's routine context.
    if (error || !data || data.owner_id !== run.created_by) userId = null;
    else userId = data.owner_id;
  }
  if (!userId || (await runSteeredByOther(run.id, userId))) {
    return {
      error:
        "Personal MCP connections are unavailable in a session steered by another member or without its current owner.",
    };
  }
  return (await executeMcpTool(userId, name, args)).result;
}
