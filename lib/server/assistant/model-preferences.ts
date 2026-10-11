import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import { DEFAULT_AGENT_PROVIDER } from "@/lib/agent-providers";
import { getUserByok } from "@/lib/server/agent/model";
import { resolveByokFeatureDefaultModel } from "@/lib/server/ai-runtime";
import type { AgentProviderId } from "@/lib/agent-providers";

/** Each provider has its own model namespace and saved account default. */
export async function getNumoDefaultModel(userId: string, provider: AgentProviderId): Promise<string | null> {
  const { data, error } = await getServiceClient().from("user_numo_preferences")
    .select("model").eq("user_id", userId).eq("provider", provider).maybeSingle();
  if (error) throw new Error("Could not load Numo preferences");
  return data?.model ?? null;
}

/** Resolve the namespace before applying a default, including generic endpoints. */
export async function getNumoPreferences(userId: string) {
  const provider = (await getUserByok(userId, "assistant"))?.provider ?? DEFAULT_AGENT_PROVIDER;
  const [model, applicationModel] = await Promise.all([
    getNumoDefaultModel(userId, provider), resolveByokFeatureDefaultModel(provider, "assistant_model"),
  ]);
  return { provider, default_model: model, application_model: applicationModel };
}
