import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { resolveSandboxPreferences, type SandboxPreferences } from "@/lib/agent-sandbox-config";

export async function getUserSandboxPreferences(userId: string): Promise<SandboxPreferences> {
  const { data, error } = await getServiceClient()
    .from("user_agent_preferences")
    .select("sandbox_region, sandbox_size")
    .eq("user_id", userId)
    .maybeSingle();
  // A failed lookup must not silently launch in a different region.
  if (error) throw new Error("Could not load sandbox preferences", { cause: error });
  return resolveSandboxPreferences(data);
}
