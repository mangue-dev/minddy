import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import { DEFAULT_AGENT_PROVIDER } from "@/lib/agent-providers";
import { MINDDY_CLOUD_PROVIDER, type AiProviderChoice } from "@/lib/ai-surfaces";
import { resolveByokFeatureDefaultModel } from "@/lib/server/ai-runtime";
import { getAiProviderOptions, getAiRoutes } from "@/lib/server/ai-routes";
import type { AiProviderOption } from "@/lib/ai-provider-options";
import { DatabaseOperationError } from "@/lib/server/failure-diagnostics";

/**
 * Numo's account defaults (MIN-826): the provider is the route of Numo
 * conversations (`assistant_model`), and each provider keeps its own default model, since every provider
 * has its own model namespace.
 *
 * Minddy Cloud's models are stored under `minddy`. Before MIN-826 they were
 * stored under `openrouter`, which a personal OpenRouter key also used; that
 * legacy row is still read for Minddy Cloud when no `minddy` row exists.
 */
export async function getNumoDefaultModel(userId: string, provider: AiProviderChoice): Promise<string | null> {
  const stored = provider === MINDDY_CLOUD_PROVIDER ? [MINDDY_CLOUD_PROVIDER, DEFAULT_AGENT_PROVIDER] : [provider];
  const { data, error, status } = await getServiceClient().from("user_numo_preferences")
    .select("provider, model").eq("user_id", userId).in("provider", stored);
  if (error) throw new DatabaseOperationError("read_numo_preferences", error, status);
  const rows = (data ?? []) as Array<{ provider: string; model: string | null }>;
  for (const candidate of stored) {
    const row = rows.find((entry) => entry.provider === candidate);
    if (row) return row.model;
  }
  return null;
}

/** The model a provider runs for Numo when the account chose none. */
export function numoApplicationModel(provider: AiProviderChoice): Promise<string | null> {
  return resolveByokFeatureDefaultModel(
    provider === MINDDY_CLOUD_PROVIDER ? DEFAULT_AGENT_PROVIDER : provider,
    "assistant_model",
  );
}

export interface NumoPreferences {
  /** Numo's default provider: the route of Numo conversations. */
  provider: AiProviderChoice;
  default_model: string | null;
  application_model: string | null;
  /** Providers the account can choose for Numo. */
  providers: AiProviderOption[];
}

export async function getNumoPreferences(userId: string): Promise<NumoPreferences> {
  const [routes, providers] = await Promise.all([
    getAiRoutes(userId),
    getAiProviderOptions(userId, "assistant_model"),
  ]);
  const provider = routes.assistant_model;
  const [model, applicationModel] = await Promise.all([
    getNumoDefaultModel(userId, provider),
    numoApplicationModel(provider),
  ]);
  return { provider, default_model: model, application_model: applicationModel, providers };
}

/** Saves the default model of one provider; `null` follows the application default. */
export async function saveNumoDefaultModel(
  userId: string,
  provider: AiProviderChoice,
  model: string | null,
): Promise<void> {
  const { error, status } = await getServiceClient().from("user_numo_preferences").upsert({
    user_id: userId, provider, model, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) throw new DatabaseOperationError("save_numo_preferences", error, status);
}
