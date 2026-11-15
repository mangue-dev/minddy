/**
 * BYOK provider registry (MIN-46), shared by client and server (no
 * `server-only`): the settings panel, the ai-keys route, key resolution
 * (`lib/server/agent/model.ts`) and every server-side AI call rely on it.
 *
 * Providers are addressed through the OpenAI-compatible
 * `<baseUrl>/chat/completions` endpoint with `Authorization: Bearer <apiKey>`,
 * except Anthropic, whose compatibility layer cannot carry Claude's reasoning:
 * its calls go to the native `<baseUrl>/messages` and are converted back to
 * the chat shape (`lib/server/anthropic-messages.ts`). The generic provider
 * covers any OpenAI-compatible server through a base URL the user enters.
 * Per-provider differences (attribution headers, usage count, API version)
 * live in `requestProfile`.
 */

export type AgentProviderId =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google"
  /** OpenCode Go subscription, served by the OpenCode Zen gateway (MIN-544). */
  | "opencode-go"
  /** OpenCode Zen pay-as-you-go gateway — same API as Go, other base path (MIN-544). */
  | "opencode-zen"
  | "generic";

/**
 * Local providers retired in MIN-996: no server call could reach them. Rows
 * saved before stay listed so their owner can remove them; nothing new is
 * accepted. The schema cleanup deletes the rows and this list with them.
 */
export const RETIRED_LOCAL_PROVIDERS = ["local_openai", "ollama"] as const;

export function isRetiredLocalProvider(id: string | null | undefined): boolean {
  return (RETIRED_LOCAL_PROVIDERS as readonly string[]).includes(id ?? "");
}

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
  /**
   * Header carrying a stable per-conversation session id, sent with a Minddy
   * user agent (`aiChatProviderHeaders`). OpenCode Go refuses a call without it.
   */
  sessionHeader?: "x-opencode-session";
}

export interface AgentProviderDef {
  id: AgentProviderId;
  label: string;
  /** OpenAI-compatible base URL (without `/chat/completions`). Absent = entered by the user (generic). */
  baseUrl?: string;
  /** true → the user MUST provide a base URL (generic). */
  requiresBaseUrl?: boolean;
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
  /**
 * “Sample” template id to derive the logo via `providerFromModel`
 * (reuses @lobehub/icons mapping). "" = no logo (generic → Cpu).
 */
  logoModel: string;
  /** Model listing strategy (`lib/server/agent/models-catalog.ts`). */
  listStrategy: "openrouter" | "openai" | "anthropic" | "generic";
  requestProfile: ProviderRequestProfile;
  /** Link to the key generation page (wizard help). */
  keysUrl?: string;
}

export const AGENT_PROVIDERS: AgentProviderDef[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    // No own default: takes over the platform settings of each call type,
    // exactly like the minddy quota (same OpenRouter endpoint).
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
    logoModel: "anthropic/x",
    listStrategy: "anthropic",
    // Native Messages API (MIN-826): the ceiling is `max_tokens`, usage is
    // always reported in the stream, and reasoning keeps the Anthropic form.
    requestProfile: {
      outputTokenField: "max_tokens",
      defaultMaxOutputTokens: 8192,
      reasoningField: "thinking",
    },
    keysUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    // 3.5 Flash is retired in AI Studio and rerouted to 3.6 Flash.
    defaultModel: "gemini-3.6-flash",
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
    // OpenCode Go is a $10/month subscription of the OpenCode Zen gateway:
    // same console, same API, another base path (`/inference/go`). Every model
    // the gateway lists is served through OpenAI-compatible
    // `<baseUrl>/chat/completions` (models.dev declares both providers on
    // @ai-sdk/openai-compatible), so the uniform loop/VM transport works as-is.
    // The `/models` listing is PUBLIC: it feeds the catalog but cannot probe
    // a key — see `probeRequestFor` (byok-validate.ts).
    id: "opencode-go",
    label: "OpenCode Go",
    // The `/inference` paths replace the legacy `/zen/go/v1` (still served);
    // Go models declare this chat base in their `/models` entry.
    baseUrl: "https://opencode.ai/inference/go/openai/v1",
    defaultModel: "glm-5.3-flash",
    logoModel: "opencode/x",
    listStrategy: "openai",
    // Conservative profile: the gateway tolerance for reasoning fields is not
    // verified, so direct calls send none (the agent harness is unaffected:
    // the opencode VM path nests `reasoning: {effort}` for every provider).
    requestProfile: {
      streamUsage: true,
      outputTokenField: "max_tokens",
      sessionHeader: "x-opencode-session",
    },
    keysUrl: "https://opencode.ai/auth",
  },
  {
    // OpenCode Zen is the pay-as-you-go twin of Go: same console, same API
    // shape, base path `/inference`.
    id: "opencode-zen",
    label: "OpenCode Zen",
    // Replaces the legacy `/zen/v1`; chat models declare this base.
    baseUrl: "https://opencode.ai/inference/openai/v1",
    defaultModel: "glm-5.3-flash",
    logoModel: "opencode/x",
    listStrategy: "openai",
    requestProfile: {
      streamUsage: true,
      outputTokenField: "max_tokens",
    },
    keysUrl: "https://opencode.ai/auth",
  },
  {
    id: "generic",
    label: "Générique (OpenAI-compatible)",
    requiresBaseUrl: true,
    logoModel: "",
    listStrategy: "generic",
    // A generic server can only implement the old Chat contract
    // Completions. No provider extensions are sent there.
    requestProfile: { outputTokenField: "max_tokens" },
  },
];

/** Default Provider when no BYOK: OpenRouter platform key. */
export const DEFAULT_AGENT_PROVIDER: AgentProviderId = "openrouter";

export function getAgentProvider(id: string | null | undefined): AgentProviderDef | undefined {
  return AGENT_PROVIDERS.find((p) => p.id === id);
}

export function isKnownAgentProvider(id: string): id is AgentProviderId {
  return AGENT_PROVIDERS.some((p) => p.id === id);
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
  return normalizeBaseUrl(raw);
}

/** OpenAI-compatible chat completion URL for a given database. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}
