import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { objectiveInProject } from "@/lib/server/tenancy";

/** Resolve only live objectives in the feedback's own project. */
export async function validateFeedbackObjective(
  service: SupabaseClient, projectId: string, value: unknown,
): Promise<boolean> {
  if (value === null || value === undefined) return true;
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) &&
    await objectiveInProject(service, value, projectId);
}
