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
 * conversations (`assistant_model`), and each personal provider keeps its own
 * default model, since every provider has its own model namespace. Since
 * MIN-954 the instance's provider takes no default model: rows saved under
 * `minddy` (or under `openrouter` before MIN-826) are no longer read for it.
 */
export async function getNumoDefaultModel(userId: string, provider: AiProviderChoice): Promise<string | null> {
  const { data, error, status } = await getServiceClient().from("user_numo_preferences")
    .select("provider, model").eq("user_id", userId).in("provider", [provider]);
  if (error) throw new DatabaseOperationError("read_numo_preferences", error, status);
  const rows = (data ?? []) as Array<{ provider: string; model: string | null }>;
  return rows.find((entry) => entry.provider === provider)?.model ?? null;
}

/**
 * Whether the instance, not the account, sets Numo's model (MIN-954). On
 * Minddy Cloud, or on a self-hosted instance's own key, Numo runs the model
 * and reasoning level the administrator configured for `assistant_model`, as
 * Smart Assign and Smart Fill do. Only a personal key (BYOK) keeps the choice.
 */
export function numoModelIsInstanceDefined(provider: AiProviderChoice | null | undefined): boolean {
  return provider === MINDDY_CLOUD_PROVIDER;
}

/** Numo's default provider: the route of the Numo usage. */
export async function getNumoProvider(userId: string): Promise<AiProviderChoice> {
  return (await getAiRoutes(userId)).assistant_model;
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
  /** Null while the instance sets the model: a saved choice is ignored. */
  default_model: string | null;
  application_model: string | null;
  /** True when the instance sets the model and reasoning (MIN-954). */
  model_locked: boolean;
  /** Providers the account can choose for Numo. */
  providers: AiProviderOption[];
}

export async function getNumoPreferences(userId: string): Promise<NumoPreferences> {
  const [routes, providers] = await Promise.all([
    getAiRoutes(userId),
    getAiProviderOptions(userId, "assistant_model"),
  ]);
  const provider = routes.assistant_model;
  const locked = numoModelIsInstanceDefined(provider);
  // A choice saved before MIN-954 under the instance provider stays in the
  // table for the previous release, but is no longer read.
  const [model, applicationModel] = await Promise.all([
    locked ? Promise.resolve(null) : getNumoDefaultModel(userId, provider),
    numoApplicationModel(provider),
  ]);
  return { provider, default_model: model, application_model: applicationModel, model_locked: locked, providers };
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
