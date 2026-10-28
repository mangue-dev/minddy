import type { AgentProviderId } from "@/lib/agent-providers";

/** Model families exposed by capability-aware admin catalog pickers. */
export const MODEL_CATALOG_CAPABILITIES = ["text", "transcription", "embedding"] as const;

export type ModelCatalogCapability = (typeof MODEL_CATALOG_CAPABILITIES)[number];

/**
 * Families the platform admin catalog can filter on. `decision` is admin-only:
 * decision models (OpenRouter `output_modalities: ["decisions"]`) answer typed
 * questions on the decisions endpoint and are never a BYOK assignment, so the
 * account capability lists above stay unchanged.
 */
export const ADMIN_CATALOG_CAPABILITIES = [...MODEL_CATALOG_CAPABILITIES, "decision"] as const;

export type AdminCatalogCapability = (typeof ADMIN_CATALOG_CAPABILITIES)[number];

/**
 * Model families that Minddy can route through each BYOK provider.
 *
 * This is deliberately provider-derived rather than user-configurable. Replacing
 * a key or changing its provider therefore recomputes coverage immediately and
 * cannot leave a stale capability selection behind. Generic and local endpoints
 * only promise the OpenAI-compatible chat contract, so specialized endpoints
 * stay on managed AI unless a future discovery contract can prove otherwise.
 */
export const BYOK_PROVIDER_CAPABILITIES: Readonly<
  Record<AgentProviderId, readonly ModelCatalogCapability[]>
> = {
  openrouter: MODEL_CATALOG_CAPABILITIES,
  openai: MODEL_CATALOG_CAPABILITIES,
  anthropic: ["text"],
  google: ["text", "embedding"],
  "opencode-go": ["text"],
  "opencode-zen": ["text"],
  generic: ["text"],
  local_openai: ["text"],
  ollama: ["text"],
};

export function isModelCatalogCapability(
  value: string | null | undefined,
): value is ModelCatalogCapability {
  return (MODEL_CATALOG_CAPABILITIES as readonly string[]).includes(value ?? "");
}

export function isAdminCatalogCapability(
  value: string | null | undefined,
): value is AdminCatalogCapability {
  return (ADMIN_CATALOG_CAPABILITIES as readonly string[]).includes(value ?? "");
}

/** Capability required by a configured runtime model. */
export function modelCatalogCapabilityForKey(key: string): ModelCatalogCapability {
  if (key === "transcription_model") return "transcription";
  if (key === "feedback_embedding_model" || key === "issue_embedding_model") return "embedding";
  return "text";
}

export function byokCapabilitiesForProvider(
  provider: AgentProviderId,
): readonly ModelCatalogCapability[] {
  return BYOK_PROVIDER_CAPABILITIES[provider];
}

export function providerSupportsModelCapability(
  provider: AgentProviderId,
  capability: ModelCatalogCapability,
): boolean {
  return BYOK_PROVIDER_CAPABILITIES[provider].includes(capability);
}

export function providerSupportsModelKey(provider: AgentProviderId, modelKey: string): boolean {
  return providerSupportsModelCapability(provider, modelCatalogCapabilityForKey(modelKey));
}

/**
 * Whether a credential of this provider can serve a call type (MIN-826): it
 * offers the model family, and web search, which runs on OpenRouter's web
 * plugin, needs an OpenRouter key.
 */
export function providerServesModelKey(provider: AgentProviderId, modelKey: string): boolean {
  if (modelKey === "web_search_model") return provider === "openrouter";
  return providerSupportsModelKey(provider, modelKey);
}
