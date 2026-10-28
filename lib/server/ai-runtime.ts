import "server-only";

import {
  DEFAULT_AGENT_PROVIDER,
  getAgentProvider,
  isLocalAgentProvider,
  resolveProviderBaseUrl,
  type AgentProviderId,
  type ProviderRequestProfile,
} from "@/lib/agent-providers";
import {
  MINDDY_CLOUD_PROVIDER,
  byokFeatureDefaultModelKey,
  surfaceForModelKey,
  type AiProviderChoice,
  type AiSurface,
  type ByokModelKey,
} from "@/lib/ai-surfaces";
import { aiModelFallback } from "@/lib/ai-model-config";
import { getAppConfigValues } from "@/lib/server/app-config";
import { modelConfigKeys, resolveFromValues } from "@/lib/server/model-config";
import {
  getUserByok,
  getUserByokForProvider,
  LocalEndpointRequiresLocalRunError,
} from "@/lib/server/agent/model";
import { chatCompletionsUrl, normalizeBaseUrl } from "@/lib/agent-providers";
import {
  aiChatProviderHeaders,
  repairRejectedAiChatBody,
  translateAiChatRequest,
  type AiChatRequest,
} from "@/lib/ai-chat";
import { fetchOpenRouterWithSuffixFallback } from "@/lib/server/model-config";
import { isManagedAiEnabled, managedAiKeyMode } from "@/lib/managed-services";
import { PlanLimitError } from "@/lib/server/plan-limit-error";
import { fetchAiProvider } from "@/lib/server/ai-provider-request";
import {
  ChosenProviderUnavailableError,
  providerErrorFromResponse,
  reportProviderError,
} from "@/lib/server/ai-provider-errors";
import {
  ANTHROPIC_API_VERSION,
  toAnthropicMessagesBody,
  toChatCompletionsResponse,
} from "@/lib/server/anthropic-messages";
import { providerSupportsModelKey } from "@/lib/model-catalog-capability";
import { modelCatalogCapabilityForKey } from "@/lib/model-catalog-capability";

export type AiKeyMode = "platform" | "byok";

/** No platform fallback outside AI service explicitly operated by minddy. */
export class ManagedAiUnavailableError extends Error {
  constructor() {
    super(
      "Managed AI is not configured. Configure BYOK or enable MINDDY_MANAGED_AI.",
    );
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
  /**
   * Set when `apiKey` is a per-account Minddy Cloud key (MIN-761): the billed
   * account, or `"public"` for the anonymous surfaces' key.
   */
  managedKeyOwner?: string;
}

/** A managed OpenRouter key, and whose it is. */
export interface PlatformApiKey {
  apiKey: string;
  managedKeyOwner?: string;
}

/**
 * The OpenRouter key a managed call pays with (MIN-761): on Minddy Cloud, the
 * billed account's own capped key, or the daily-capped public key for a call
 * that bills no account; elsewhere the single `OPENROUTER_API_KEY`. `null`
 * when managed AI is off. Throws when Cloud cannot provide the account key:
 * there is no fallback to the uncapped shared key.
 */
export async function resolvePlatformApiKey(
  billedUserId: string | null,
): Promise<PlatformApiKey | null> {
  if (!isManagedAiEnabled()) return null;
  if (managedAiKeyMode() === "per_user") {
    // Loaded on demand: the key module reads billing and usage, which import
    // this module.
    const managed = await import("@/lib/server/managed-ai-key");
    return billedUserId
      ? { apiKey: await managed.resolveUserAiKey(billedUserId), managedKeyOwner: billedUserId }
      : { apiKey: await managed.resolvePublicAiKey(), managedKeyOwner: "public" };
  }
  return sharedPlatformApiKey();
}

/** The shared key, for reads that spend nothing (model catalog). */
function sharedPlatformApiKey(): PlatformApiKey | null {
  const apiKey = isManagedAiEnabled() ? process.env.OPENROUTER_API_KEY : undefined;
  return apiKey ? { apiKey } : null;
}

/**
 * Reacts to OpenRouter refusing a per-account key, for any caller that reads
 * the response itself. 401: the key was deleted or revoked outside Minddy, so it
 * is discarded and the next call issues a new one. 402, or a 403 about the key
 * limit: the provider cap held where our pre-flight did not, and the caller
 * shows the same "budget reached" error, never the provider's.
 */
export async function handleManagedKeyRejection(
  key: PlatformApiKey,
  status: number,
  detail = "",
): Promise<void> {
  const owner = key.managedKeyOwner;
  if (!owner || (status !== 401 && status !== 402 && status !== 403)) return;
  if (status === 401) {
    const managed = await import("@/lib/server/managed-ai-key");
    await managed.discardManagedAiKey(owner, key.apiKey);
    return;
  }
  if (status === 403 && !/limit/i.test(detail)) return;
  console.warn(`[ai-runtime] OpenRouter refused a managed key at its cap (HTTP ${status})`);
  if (owner !== "public") throw new PlanLimitError("usage_budget_exceeded");
}

async function platformModel(modelKey: ByokModelKey): Promise<string> {
  const values = await getAppConfigValues(modelConfigKeys(modelKey));
  return resolveFromValues(modelKey, values).model;
}

async function providerDefaultModel(
  provider: AgentProviderId,
  modelKey: ByokModelKey,
): Promise<string | null> {
  if (!providerSupportsModelKey(provider, modelKey)) return null;
  const featureKey = byokFeatureDefaultModelKey(provider, modelKey);
  const values = await getAppConfigValues([featureKey]);
  const configured = values[featureKey]?.trim();
  if (configured) return configured;

  const registryFallback = aiModelFallback(featureKey).trim();
  if (registryFallback) return registryFallback;
  if (provider === "generic") return null;
  if (modelCatalogCapabilityForKey(modelKey) === "embedding" && provider === "google") {
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
  /** A conversation choice, frozen by the caller before the turn is admitted. */
  modelOverride?: string | null;
  /**
   * A provider chosen explicitly (a Numo conversation, MIN-826) instead of the
   * usage's route: `minddy` for Minddy Cloud, or one of the account's
   * credentials. A credential that no longer serves raises
   * `ChosenProviderUnavailableError` rather than silently paying elsewhere.
   */
  provider?: AiProviderChoice | null;
  /** Public documentation help always uses the account's managed allowance. */
  managedOnly?: boolean;
  /** Numo account defaults supersede legacy per-key assistant model settings. */
  applicationModelDefault?: boolean;
  /**
   * The runtime only validates a choice or lists models, and never pays for a
   * call: on Minddy Cloud no account key is issued for it, and its platform key
   * is the shared one, which only reads the catalog (MIN-761).
   */
  catalogOnly?: boolean;
}): Promise<ResolvedAiRuntime> {
  const surface = params.surface ?? surfaceForModelKey(params.modelKey);
  const modelOverride = params.modelOverride?.trim() || null;
  const capability = modelCatalogCapabilityForKey(params.modelKey);
  const chosenProvider = params.managedOnly ? MINDDY_CLOUD_PROVIDER : params.provider ?? null;
  const [byok, rootModel] = await Promise.all([
    chosenProvider === MINDDY_CLOUD_PROVIDER
      ? Promise.resolve(null)
      : chosenProvider
        ? getUserByokForProvider(params.userId, chosenProvider, { surface, capability })
        : getUserByok(params.userId, surface, capability, params.modelKey),
    platformModel(params.modelKey),
  ]);
  if (chosenProvider && chosenProvider !== MINDDY_CLOUD_PROVIDER &&
    (!byok || !providerSupportsModelKey(byok.provider, params.modelKey))) {
    throw new ChosenProviderUnavailableError(chosenProvider);
  }

  if (byok && providerSupportsModelKey(byok.provider, params.modelKey)) {
    if (isLocalAgentProvider(byok.provider)) {
      throw new LocalEndpointRequiresLocalRunError();
    }
    const chosen = params.applicationModelDefault ? null : byok.featureModels[params.modelKey]?.trim();
    const model =
      modelOverride ||
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
        requestProfile: getAgentProvider(byok.provider)?.requestProfile ?? {
          outputTokenField: "max_tokens",
        },
      };
    }
  }

  return platformRuntime(
    params.catalogOnly ? sharedPlatformApiKey() : await resolvePlatformApiKey(params.userId),
    modelOverride || rootModel || aiModelFallback(params.modelKey),
  );
}

function platformRuntime(platformKey: PlatformApiKey | null, model: string): ResolvedAiRuntime {
  if (!platformKey) throw new ManagedAiUnavailableError();
  const baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER);
  if (!baseUrl) throw new Error("OpenRouter base URL not configured");
  return {
    ...platformKey,
    mode: "platform",
    provider: DEFAULT_AGENT_PROVIDER,
    baseUrl,
    model,
    requestProfile: getAgentProvider(DEFAULT_AGENT_PROVIDER)
      ?.requestProfile ?? {
      outputTokenField: "max_completion_tokens",
    },
  };
}

/**
 * Runtime of a managed call that bills no account (a public board without a
 * resolvable owner): the platform model on the public key, never on an
 * account's key.
 */
export async function resolveUnbilledAiRuntime(modelKey: ByokModelKey): Promise<ResolvedAiRuntime> {
  const [platformKey, rootModel] = await Promise.all([
    resolvePlatformApiKey(null),
    platformModel(modelKey),
  ]);
  return platformRuntime(platformKey, rootModel || aiModelFallback(modelKey));
}

export async function usesByokForSurface(
  userId: string,
  surface: AiSurface,
  modelKeys?: ByokModelKey | readonly ByokModelKey[],
): Promise<boolean> {
  const required = modelKeys
    ? Array.isArray(modelKeys)
      ? modelKeys
      : [modelKeys]
    : [];
  if (required.length === 0)
    return (await getUserByok(userId, surface, "text")) !== null;
  const credentials = await Promise.all(
    required.map((modelKey) =>
      getUserByok(userId, surface, modelCatalogCapabilityForKey(modelKey), modelKey),
    ),
  );
  return credentials.every(
    (byok, index) =>
      !!byok && providerSupportsModelKey(byok.provider, required[index]!),
  );
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
 * Anthropic through its native Messages API (MIN-826): the chat body built for
 * every provider is converted, and the reply converted back, so callers keep
 * parsing one shape.
 */
async function fetchAnthropicMessages(
  runtime: ResolvedAiRuntime,
  chatRequest: RequestInit,
  http: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  const chatBody = JSON.parse(String(chatRequest.body)) as Record<string, unknown>;
  const body = toAnthropicMessagesBody(chatBody);
  const response = await http(`${normalizeBaseUrl(runtime.baseUrl)}/messages`, {
    ...chatRequest,
    headers: {
      "x-api-key": runtime.apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return toChatCompletionsResponse(response, body.stream === true);
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
    const result = await fetchOpenRouterWithSuffixFallback(
      endpoint,
      model,
      request,
      logPrefix,
      (url, options) => fetchAiProvider(runtime.provider, url, options),
    );
    if (!result.response.ok && runtime.managedKeyOwner) {
      await handleManagedKeyRejection(
        runtime,
        result.response.status,
        await result.response.clone().text().catch(() => ""),
      );
    }
    return reportFailedChat(runtime, result, logPrefix);
  }
  const http = (url: string, options: RequestInit) =>
    fetchAiProvider(runtime.provider, url, options);
  if (runtime.provider === "anthropic") {
    return reportFailedChat(runtime, {
      response: await fetchAnthropicMessages(runtime, request(model), http),
      model,
    }, logPrefix);
  }
  const firstRequest = request(model);
  const firstResponse = await http(endpoint, firstRequest);
  return reportFailedChat(runtime, {
    response: await retryRejectedChatRequest(
      endpoint,
      firstResponse,
      firstRequest,
      http,
    ),
    model,
  }, logPrefix);
}

/**
 * Logs and reports a final provider rejection (after the documented replays),
 * for every surface that calls a model. The response is returned untouched.
 */
async function reportFailedChat(
  runtime: ResolvedAiRuntime,
  result: { response: Response; model: string },
  logPrefix: string,
): Promise<{ response: Response; model: string }> {
  if (!result.response.ok) {
    reportProviderError(
      await providerErrorFromResponse(runtime.provider, result.model, result.response),
      logPrefix.replace(/^\[|\]$/g, "") || "ai",
    );
  }
  return result;
}
