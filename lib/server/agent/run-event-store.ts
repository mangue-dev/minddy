import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type StoredRunEvent = {
  id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

/** A first shared read boundary for run events; the payload is still plaintext. */
export async function listRunEvents(
  service: SupabaseClient,
  run: { id: string; project_id: string },
  options: { after?: number; types?: string[] } = {},
): Promise<StoredRunEvent[]> {
  if (!run.id || !run.project_id) throw new Error("Run event project scope is required");
  let query = service.from("agent_run_events")
    .select("id,seq,type,payload,created_at,run:agent_runs!inner(project_id)")
    .eq("run_id", run.id)
    .eq("run.project_id", run.project_id)
    .order("seq", { ascending: true });
  if (options.after !== undefined) query = query.gt("seq", options.after);
  if (options.types) query = query.in("type", options.types);
  const { data, error } = await query;
  if (error) throw new Error("Unable to read agent run events");
  return (data ?? []).map((row) => ({
    id: row.id, seq: row.seq, type: row.type,
    payload: row.payload, created_at: row.created_at,
  }));
}
