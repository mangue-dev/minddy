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
import {
  aiChatProviderHeaders,
  repairRejectedAiChatBody,
  translateAiChatRequest,
  type AiChatRequest,
} from "@/lib/ai-chat";
import { fetchOpenRouterWithSuffixFallback } from "@/lib/server/model-config";
import { isManagedAiEnabled } from "@/lib/managed-services";
import { safeFetchResponse } from "@/lib/server/safe-fetch";

export type AiKeyMode = "platform" | "byok";

/** No platform fallback outside AI service explicitly operated by minddy. */
export class ManagedAiUnavailableError extends Error {
  constructor() {
    super("Managed AI is not configured. Configure BYOK or enable MINDDY_MANAGED_AI.");
    this.name = "ManagedAiUnavailableError";
  }
}

/** Everything an AI caller needs to know, solved in one place. */
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

  // Compatibility with historical agent BYOK settings.
  if (modelKey === "agent_model") return (await resolveProviderDefaultModel(provider)) ?? null;
  const registryFallback = aiModelFallback(featureKey).trim();
  if (registryFallback) return registryFallback;
  // No equivalent native endpoint at Anthropic; without explicit admin choice,
  // these calls stay on Minddy instead of sending an obviously false model.
  if (modelKey === "transcription_model" && provider !== "openai") return null;
  if (modelKey === "feedback_embedding_model" && provider === "anthropic") return null;
  if (provider === "generic") return null;
  if (modelKey === "feedback_embedding_model" && provider === "google") {
    return "gemini-embedding-001";
  }
  return getAgentProvider(provider)?.defaultModel?.trim() || null;
}

/** Displayable fault of a provider for a type of call, without reading a user key. */
export async function resolveByokFeatureDefaultModel(
  provider: AgentProviderId,
  modelKey: ByokModelKey,
): Promise<string | null> {
  return provider === "openrouter"
    ? platformModel(modelKey)
    : providerDefaultModel(provider, modelKey);
}

/**
 * Resolves provider + key + model for a call attributed to a user. A surface
 * unchecked falls entirely on Minddy. OpenRouter BYOK takes over the model
 * platform of the same type; native providers first take the choice of
 * account, then the default admin/provider.
 */
export async function resolveAiRuntime(params: {
  userId: string;
  modelKey: ByokModelKey;
  /** To be specified only if a call belongs to a surface other than its model (feedback voice). */
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
    // A generic endpoint without a reliable model cannot receive an id
    // OpenRouter at random: we keep the feature on the quota until the choice.
    if (model) {
      return {
        apiKey: byok.apiKey,
        mode: "byok",
        provider: byok.provider,
        baseUrl: byok.baseUrl,
        model,
        requestProfile:
          getAgentProvider(byok.provider)?.requestProfile ?? { outputTokenField: "max_tokens" },
      };
    }
  }

  if (!isManagedAiEnabled()) throw new ManagedAiUnavailableError();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new ManagedAiUnavailableError();
  const baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER);
  if (!baseUrl) throw new Error("OpenRouter base URL not configured");
  return {
    apiKey,
    mode: "platform",
    provider: DEFAULT_AGENT_PROVIDER,
    baseUrl,
    model: rootModel || aiModelFallback(params.modelKey),
    requestProfile:
      getAgentProvider(DEFAULT_AGENT_PROVIDER)?.requestProfile ?? {
        outputTokenField: "max_completion_tokens",
      },
  };
}

export async function usesByokForSurface(userId: string, surface: AiSurface): Promise<boolean> {
  return (await getUserByok(userId, surface)) !== null;
}

async function retryRejectedChatRequest(
  endpoint: string,
  firstResponse: Response,
  firstRequest: RequestInit,
  request: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  if (firstResponse.status !== 400 || typeof firstRequest.body !== "string") {
    return firstResponse;
  }

  const retryBody = repairRejectedAiChatBody(
    firstRequest.body,
    await firstResponse.clone().text(),
  );
  return retryBody === null
    ? firstResponse
    : request(endpoint, { ...firstRequest, body: retryBody });
}

/**
 * Fetch chat OpenAI-compatible, with the particularities of the provider resolved.
 *
 * Profiles choose the documented contract. Only two 400s are
 * unambiguously repairable: an explicitly rejected ceiling alias, and the
 * couple GPT-5.6 function tools + reasoning explicitly refused by Chat
 * Completions. No other 400 is replayed.
 */
export async function fetchAiChat(
  runtime: ResolvedAiRuntime,
  model: string,
  requestFor: (model: string) => AiChatRequest,
  title: string,
  logPrefix: string,
  init?: Pick<RequestInit, "signal">,
): Promise<{ response: Response; model: string }> {
  const endpoint = chatCompletionsUrl(runtime.baseUrl);
  const request = (attemptModel: string): RequestInit => {
    const body = translateAiChatRequest(
      { ...requestFor(attemptModel), model: attemptModel },
      runtime.provider,
    );
    return {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.apiKey}`,
        "Content-Type": "application/json",
        ...aiChatProviderHeaders(runtime.provider, title),
      },
      body: JSON.stringify(body),
      ...init,
    };
  };
  if (runtime.provider === "openrouter") {
    return fetchOpenRouterWithSuffixFallback(endpoint, model, request, logPrefix);
  }
  const http = runtime.mode === "byok" ? safeFetchResponse : fetch;
  const firstRequest = request(model);
  const firstResponse = await http(endpoint, firstRequest);
  return {
    response: await retryRejectedChatRequest(endpoint, firstResponse, firstRequest, http),
    model,
  };
}
