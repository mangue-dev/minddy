import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { agentSandboxName, legacyAgentSandboxName } from "./network-policy";
import { revokeRunKey } from "./run-key";
import { deleteSandboxByName } from "./sandbox";

export interface ErasableAgentRun {
  id: string;
  sandbox_id: string | null;
  provider_key_id: string | null;
}

/** Read every run without relying on PostgREST's default row limit. */
export async function listScopedAgentRuns(
  column: "project_id" | "conversation_id",
  scopeId: string,
): Promise<ErasableAgentRun[]> {
  const rows: ErasableAgentRun[] = [];
  const service = getServiceClient();
  let lastId: string | null = null;
  for (;;) {
    let query = service
      .from("agent_runs")
      .select("id, sandbox_id, provider_key_id")
      .eq(column, scopeId)
      .order("id", { ascending: true })
      .limit(500);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) throw new Error("Unable to enumerate Agent sandboxes");
    rows.push(...((data ?? []) as ErasableAgentRun[]));
    if (!data || data.length < 500) return rows;
    lastId = data[data.length - 1].id as string;
  }
}

/** Erase active and historical Agent compute before a project is purged. */
export async function eraseAgentSandboxesForProject(projectId: string): Promise<void> {
  for (const run of await listScopedAgentRuns("project_id", projectId)) {
    const runId = run.id as string;
    for (const name of new Set([
      run.sandbox_id as string | null,
      agentSandboxName(runId),
      legacyAgentSandboxName(runId),
    ])) {
      if (name) await deleteSandboxByName(name);
    }
    if (run.provider_key_id) await revokeRunKey(run.provider_key_id as string);
  }
}
