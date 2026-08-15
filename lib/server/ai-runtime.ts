import "server-only";

import {
  DEFAULT_AGENT_PROVIDER,
  getAgentProvider,
  resolveProviderBaseUrl,
  type AgentProviderId,
  type ProviderRequestProfile,
} from "@/lib/agent-providers";
import {
  byokFeatureDefaultModelKey,
  surfaceForModelKey,
  type AiSurface,
  type ByokModelKey,
} from "@/lib/ai-surfaces";
import { aiModelFallback } from "@/lib/ai-model-config";
import { getAppConfigValues } from "@/lib/server/app-config";
import { modelConfigKeys, resolveFromValues } from "@/lib/server/model-config";
import { getUserByok, resolveProviderDefaultModel } from "@/lib/server/agent/model";
import { chatCompletionsUrl } from "@/lib/agent-providers";
import { fetchOpenRouterWithSuffixFallback } from "@/lib/server/model-config";

export type AiKeyMode = "platform" | "byok";

/** Tout ce qu'un appel IA doit savoir, résolu en un seul endroit. */
export interface ResolvedAiRuntime {
  apiKey: string;
  mode: AiKeyMode;
  provider: AgentProviderId;
  baseUrl: string;
  model: string;
  requestProfile: ProviderRequestProfile;
}

async function platformModel(modelKey: ByokModelKey): Promise<string> {
  const values = await getAppConfigValues(modelConfigKeys(modelKey));
  return resolveFromValues(modelKey, values).model;
}

async function providerDefaultModel(
  provider: AgentProviderId,
  modelKey: ByokModelKey,
): Promise<string | null> {
  const featureKey = byokFeatureDefaultModelKey(provider, modelKey);
  const values = await getAppConfigValues([featureKey]);
  const configured = values[featureKey]?.trim();
  if (configured) return configured;

  // Compatibilité avec les réglages BYOK historiques de l'agent.
  if (modelKey === "agent_model") return (await resolveProviderDefaultModel(provider)) ?? null;
  const registryFallback = aiModelFallback(featureKey).trim();
  if (registryFallback) return registryFallback;
  // Aucun endpoint natif équivalent chez Anthropic ; sans choix admin explicite,
  // ces appels restent sur Minddy au lieu d'envoyer un modèle manifestement faux.
  if (modelKey === "transcription_model" && provider !== "openai") return null;
  if (modelKey === "feedback_embedding_model" && provider === "anthropic") return null;
  if (provider === "generic") return null;
  if (modelKey === "feedback_embedding_model" && provider === "google") {
    return "gemini-embedding-001";
  }
  return getAgentProvider(provider)?.defaultModel?.trim() || null;
}

/** Défaut affichable d'un provider pour un type d'appel, sans lire de clé user. */
export async function resolveByokFeatureDefaultModel(
  provider: AgentProviderId,
  modelKey: ByokModelKey,
): Promise<string | null> {
  return provider === "openrouter"
    ? platformModel(modelKey)
    : providerDefaultModel(provider, modelKey);
}

/**
 * Résout provider + clé + modèle pour un appel imputé à un user. Une surface
 * décochée retombe intégralement sur Minddy. OpenRouter BYOK reprend le modèle
 * plateforme du même type ; les providers natifs prennent d'abord le choix du
 * compte, puis le défaut admin/provider.
 */
export async function resolveAiRuntime(params: {
  userId: string;
  modelKey: ByokModelKey;
  /** À préciser seulement si un appel appartient à une autre surface que son modèle (feedback voice). */
  surface?: AiSurface;
}): Promise<ResolvedAiRuntime> {
  const surface = params.surface ?? surfaceForModelKey(params.modelKey);
  const [byok, rootModel] = await Promise.all([
    getUserByok(params.userId, surface),
    platformModel(params.modelKey),
  ]);

  if (byok) {
    const chosen = byok.featureModels[params.modelKey]?.trim();
    const model =
      chosen ||
      (byok.provider === "openrouter"
        ? rootModel
        : await providerDefaultModel(byok.provider, params.modelKey));
    // Un endpoint générique sans modèle fiable ne peut pas recevoir un id
    // OpenRouter au hasard : on garde la feature sur le quota jusqu'au choix.
    if (model) {
      return {
        apiKey: byok.apiKey,
        mode: "byok",
        provider: byok.provider,
        baseUrl: byok.baseUrl,
        model,
        requestProfile: getAgentProvider(byok.provider)?.requestProfile ?? {},
      };
    }
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER);
  if (!baseUrl) throw new Error("OpenRouter base URL not configured");
  return {
    apiKey,
    mode: "platform",
    provider: DEFAULT_AGENT_PROVIDER,
    baseUrl,
    model: rootModel || aiModelFallback(params.modelKey),
    requestProfile: getAgentProvider(DEFAULT_AGENT_PROVIDER)?.requestProfile ?? {},
  };
}

export async function usesByokForSurface(userId: string, surface: AiSurface): Promise<boolean> {
  return (await getUserByok(userId, surface)) !== null;
}

/** Fetch chat OpenAI-compatible, avec les particularités du provider résolu. */
export async function fetchAiChat(
  runtime: ResolvedAiRuntime,
  model: string,
  bodyFor: (model: string) => Record<string, unknown>,
  title: string,
  logPrefix: string,
): Promise<{ response: Response; model: string }> {
  const endpoint = chatCompletionsUrl(runtime.baseUrl);
  const request = (attemptModel: string): RequestInit => {
    const body: Record<string, unknown> = { ...bodyFor(attemptModel), model: attemptModel };
    if (!runtime.requestProfile.usageAccounting) delete body.usage;
    if (!runtime.requestProfile.streamUsage) delete body.stream_options;
    if (runtime.requestProfile.maxTokens && body.max_tokens == null) {
      body.max_tokens = runtime.requestProfile.maxTokens;
    }
    return {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.apiKey}`,
        "Content-Type": "application/json",
        ...(runtime.requestProfile.anthropicVersion
          ? { "anthropic-version": "2023-06-01" }
          : {}),
        ...(runtime.requestProfile.attribution
          ? { "HTTP-Referer": "https://minddy.app", "X-Title": title }
          : {}),
      },
      body: JSON.stringify(body),
    };
  };
  if (runtime.provider === "openrouter") {
    return fetchOpenRouterWithSuffixFallback(endpoint, model, request, logPrefix);
  }
  return { response: await fetch(endpoint, request(model)), model };
}
