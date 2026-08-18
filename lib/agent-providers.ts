/**
 * Code Agent BYOK provider register (MIN-46). Shared client +
 * server (NO import server-only): config wizard (UI), route
 * ai-keys, key resolution (`lib/server/agent/model.ts`), and loop
 * (`agent-loop.ts`) all rely on this.
 *
 * Principle: all providers are addressed via the OpenAI-compatible
 * `<baseUrl>/chat/completions` endpoint with `Authorization: Bearer <apiKey>`. Anthropic,
 * OpenAI and Gemini each expose such a layer; the “generic” provider
 * covers any OpenAI-compatible server via a URL base entered by
 * the user. The particularities per provider (attribution headers,
 * usage count, API version) are carried by `requestProfile` and
 * applied in the loop.
 */

export type AgentProviderId =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google"
  | "generic"
  /** Endpoint OpenAI-compatible atteint seulement depuis l'app de bureau. */
  | "local_openai"
  /** Ollama, via sa couche OpenAI-compatible `/v1`. */
  | "ollama";

/** Adjustments to the chat request by provider (OpenAI compat variable). */
export interface ProviderRequestProfile {
  /** Sends `usage: { include: true }` (OpenRouter cost count). */
  usageAccounting?: boolean;
  /** Sends `stream_options: { include_usage: true }` (tokens in the stream). */
  streamUsage?: boolean;
  /** Wire name of the output ceiling. Surfaces speak `maxOutputTokens`. */
  outputTokenField: "max_tokens" | "max_completion_tokens";
  /** Default ceiling when a surface does not set one. */
  defaultMaxOutputTokens?: number;
  /** Adds OpenRouter attribution headers (HTTP-Referer / X-Title). */
  attribution?: boolean;
  /**
 * Marks the system prompt with a cache breakpoint `cache_control:{ephemeral}`.
 * Reserved for providers who accept it: OpenRouter transmits it to models which
 * support the caching prompt (big gain on Claude) and ignores it without error
 * elsewhere. NOT to be activated for direct OpenAI/Anthropic/Gemini
 * compat layers (risk of field rejection).
 */
  promptCaching?: boolean;
  /**
 * Form of the reasoning field accepted by this endpoint (MIN-122): the ONLY
 * gate of the feature — a provider without this field never sends any.
 * `reasoning` → `reasoning: { effort }` (OpenRouter).
 * `reasoning_effort` → `reasoning_effort` flat (OpenAI and Gemini).
 * `thinking` → adaptive/manual model-aware form (Anthropic).
 * The generic remains silent: its base URL is an unknown server, and a field
 * refused returns to 400. The levels and their translation: lib/agent-reasoning.ts.
 */
  reasoningField?: "reasoning" | "reasoning_effort" | "thinking";
}

export interface AgentProviderDef {
  id: AgentProviderId;
  label: string;
  /** Base URL OpenAI-compatible (sans `/chat/completions`). Absent = base saisie (generic). */
  baseUrl?: string;
  /** true → the user MUST provide a base URL (generic). */
  requiresBaseUrl?: boolean;
  /**
 * URL offered when installing a local endpoint. This is a draft UI,
 * never a server-side fallback: an explicitly registered URL remains
 * required to launch a run.
 */
  localDefaultBaseUrl?: string;
  /**
 * Default model (border) of this provider in BYOK — pre-filled in the
 * selector and used as a resolution fallback (see `resolveAgentModel`).
 * Absent for OpenRouter (takes the root default = quota minddy) and for the
 * generic (namespace unknown → the user must choose).
 *
 * FALLBACK only: an admin changes it from /admin without redeployment (key
 * `byok_default_model_<provider>`, cf. `resolveProviderDefaultModel`). What
 * really works is read there, not here.
 */
  defaultModel?: string;
  /** Key placeholder displayed in the wizard. */
  keyPlaceholder: string;
  /**
 * “Sample” template id to derive the logo via `providerFromModel`
 * (reuses @lobehub/icons mapping). "" = no logo (generic → Cpu).
 */
  logoModel: string;
  /** Model listing strategy (see /api/agent/models route). */
  listStrategy: "openrouter" | "openai" | "anthropic" | "generic" | "none";
  /**
 * The address designates the user's machine or network. It should
 * never be probed by the server nor be chosen for a cloud microVM.
 */
  localOnly?: boolean;
  /** OpenAI-compatible segment added when the local server is waiting for a root. */
  localBaseUrlSuffix?: string;
  requestProfile: ProviderRequestProfile;
  /** Link to the key generation page (wizard help). */
  keysUrl?: string;
}

export const AGENT_PROVIDERS: AgentProviderDef[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    // No own default: takes over the root default app_config.agent_model,
    // exactly like the minddy quota (same OpenRouter endpoint).
    keyPlaceholder: "sk-or-v1-…",
    logoModel: "openrouter/x",
    listStrategy: "openrouter",
    requestProfile: {
      usageAccounting: true,
      streamUsage: true,
      outputTokenField: "max_completion_tokens",
      defaultMaxOutputTokens: 8192,
      attribution: true,
      promptCaching: true,
      reasoningField: "reasoning",
    },
    keysUrl: "https://openrouter.ai/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-sol",
    keyPlaceholder: "sk-…",
    logoModel: "openai/x",
    listStrategy: "openai",
    requestProfile: {
      streamUsage: true,
      outputTokenField: "max_completion_tokens",
      reasoningField: "reasoning_effort",
    },
    keysUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5",
    keyPlaceholder: "sk-ant-…",
    logoModel: "anthropic/x",
    listStrategy: "anthropic",
    // The compat layer accepts both caps, but recommends the contract
    // Recent OpenAI. The reasoning, however, keeps the Anthropic form.
    requestProfile: {
      streamUsage: true,
      outputTokenField: "max_completion_tokens",
      defaultMaxOutputTokens: 8192,
      reasoningField: "thinking",
    },
    keysUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.5-flash",
    keyPlaceholder: "AIza…",
    logoModel: "google/x",
    listStrategy: "openai",
    requestProfile: {
      streamUsage: true,
      outputTokenField: "max_completion_tokens",
      reasoningField: "reasoning_effort",
    },
    keysUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "generic",
    label: "Générique (OpenAI-compatible)",
    requiresBaseUrl: true,
    keyPlaceholder: "sk-…",
    logoModel: "",
    listStrategy: "generic",
    // A generic server can only implement the old Chat contract
    // Completions. No provider extensions are sent there.
    requestProfile: { outputTokenField: "max_tokens" },
  },
  {
    id: "local_openai",
    label: "Endpoint local (OpenAI-compatible)",
    requiresBaseUrl: true,
    // Default port of LM Studio, the local OpenAI-compatible implementation
    // more widespread. The user can of course replace it.
    localDefaultBaseUrl: "http://127.0.0.1:1234/v1",
    keyPlaceholder: "sk-…",
    logoModel: "",
    listStrategy: "none",
    localOnly: true,
    // No optional field: an unknown local endpoint is the most
    // conservatrice du contrat Chat Completions.
    requestProfile: { outputTokenField: "max_tokens" },
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    requiresBaseUrl: true,
    localDefaultBaseUrl: "http://127.0.0.1:11434",
    keyPlaceholder: "ollama",
    logoModel: "",
    listStrategy: "none",
    localOnly: true,
    // Ollama exposes its Chat Completions under `/v1`, while its usual URL
    // is the root `http://127.0.0.1:11434`.
    localBaseUrlSuffix: "/v1",
    requestProfile: { outputTokenField: "max_tokens" },
  },
];

/** Default Provider when no BYOK: OpenRouter platform key. */
export const DEFAULT_AGENT_PROVIDER: AgentProviderId = "openrouter";

/**
 * “mindy quota” option of the selector: platform mode (no BYOK), the agent
 * runs on minddy's OpenRouter key within the limit of the monthly cap.
 * PSEUDO-provider reserved for the UI — does NOT belong to `AGENT_PROVIDERS` (it is not
 * not a BYOK provider on the server side, “quota minddy” = absence of BYOK key).
 */
export const MINDDY_QUOTA_PROVIDER_ID = "minddy";

export function getAgentProvider(id: string | null | undefined): AgentProviderDef | undefined {
  return AGENT_PROVIDERS.find((p) => p.id === id);
}

/**
 * Default model (border) of a provider, or undefined if it does not have its own
 *: OpenRouter (takes the root default = minddy quota) and the generic.
 */
export function getProviderDefaultModel(id: string | null | undefined): string | undefined {
  return getAgentProvider(id)?.defaultModel;
}

export function isKnownAgentProvider(id: string): id is AgentProviderId {
  return AGENT_PROVIDERS.some((p) => p.id === id);
}

/** A local endpoint can only be reached by the desktop app harness. */
export function isLocalAgentProvider(id: string | null | undefined): boolean {
  return getAgentProvider(id)?.localOnly === true;
}

/** Normalizes a URL base: trim, removes the final `/` and a pasted `/chat/completions`. */
export function normalizeBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "");
}

/**
 * Effective URL base of a provider: that of the registry, or the custom (generic).
 * Returns null if generic without URL base, or unknown provider.
 */
export function resolveProviderBaseUrl(
  providerId: string,
  customBaseUrl?: string | null,
): string | null {
  const def = getAgentProvider(providerId);
  if (!def) return null;
  const raw = def.requiresBaseUrl ? (customBaseUrl ?? "").trim() : (def.baseUrl ?? "");
  if (!raw) return null;
  const normalized = normalizeBaseUrl(raw);
  if (!def.localBaseUrlSuffix) return normalized;
  const suffix = def.localBaseUrlSuffix.replace(/^\/+/, "");
  return normalized.toLowerCase().endsWith(`/${suffix.toLowerCase()}`)
    ? normalized
    : `${normalized}/${suffix}`;
}

/** OpenAI-compatible chat completion URL for a given database. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}
