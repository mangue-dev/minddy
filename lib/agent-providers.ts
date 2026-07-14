/**
 * Registre des providers BYOK de l'agent de code (MIN-46). Partagé client +
 * serveur (AUCUN import server-only) : le wizard de config (UI), la route
 * ai-keys, la résolution de clé (`lib/server/agent/model.ts`) et la boucle
 * (`agent-loop.ts`) s'appuient tous dessus.
 *
 * Principe : tous les providers sont adressés via l'endpoint OpenAI-compatible
 * `<baseUrl>/chat/completions` avec `Authorization: Bearer <clé>`. Anthropic,
 * OpenAI et Gemini exposent chacun une telle couche ; le provider « generic »
 * couvre n'importe quel serveur OpenAI-compatible via une base URL saisie par
 * l'utilisateur. Les particularités par provider (headers d'attribution,
 * comptage d'usage, version d'API) sont portées par `requestProfile` et
 * appliquées dans la boucle.
 */

export type AgentProviderId = "openrouter" | "openai" | "anthropic" | "google" | "generic";

/** Ajustements de la requête chat par provider (compat OpenAI variable). */
export interface ProviderRequestProfile {
  /** Envoie `usage: { include: true }` (comptage de coût OpenRouter). */
  usageAccounting?: boolean;
  /** Envoie `stream_options: { include_usage: true }` (tokens dans le stream). */
  streamUsage?: boolean;
  /** Envoie `max_tokens` (évité ailleurs : conflit max_completion_tokens sur certains modèles récents). */
  maxTokens?: number;
  /** Ajoute les headers d'attribution OpenRouter (HTTP-Referer / X-Title). */
  attribution?: boolean;
  /** Ajoute `anthropic-version` (couche compat Anthropic). */
  anthropicVersion?: boolean;
}

export interface AgentProviderDef {
  id: AgentProviderId;
  label: string;
  /** Base URL OpenAI-compatible (sans `/chat/completions`). Absent = base saisie (generic). */
  baseUrl?: string;
  /** true → l'utilisateur DOIT fournir une base URL (generic). */
  requiresBaseUrl?: boolean;
  /** Placeholder de clé affiché dans le wizard. */
  keyPlaceholder: string;
  /**
   * Id modèle « échantillon » pour dériver le logo via `providerFromModel`
   * (réutilise le mapping @lobehub/icons). "" = pas de logo (generic → Cpu).
   */
  logoModel: string;
  /** Stratégie de listing des modèles (cf. route /api/agent/models). */
  listStrategy: "openrouter" | "openai" | "anthropic" | "generic";
  requestProfile: ProviderRequestProfile;
  /** Lien vers la page de génération de clé (aide du wizard). */
  keysUrl?: string;
}

export const AGENT_PROVIDERS: AgentProviderDef[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyPlaceholder: "sk-or-v1-…",
    logoModel: "openrouter/x",
    listStrategy: "openrouter",
    requestProfile: { usageAccounting: true, streamUsage: true, maxTokens: 8192, attribution: true },
    keysUrl: "https://openrouter.ai/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    keyPlaceholder: "sk-…",
    logoModel: "openai/x",
    listStrategy: "openai",
    requestProfile: { streamUsage: true },
    keysUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    keyPlaceholder: "sk-ant-…",
    logoModel: "anthropic/x",
    listStrategy: "anthropic",
    // La couche compat Anthropic s'appuie sur l'API Messages → max_tokens requis.
    requestProfile: { anthropicVersion: true, maxTokens: 8192 },
    keysUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    label: "Google (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyPlaceholder: "AIza…",
    logoModel: "google/x",
    listStrategy: "openai",
    requestProfile: {},
    keysUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "generic",
    label: "Générique (OpenAI-compatible)",
    requiresBaseUrl: true,
    keyPlaceholder: "sk-…",
    logoModel: "",
    listStrategy: "generic",
    requestProfile: {},
  },
];

/** Provider par défaut quand aucun BYOK : clé plateforme OpenRouter. */
export const DEFAULT_AGENT_PROVIDER: AgentProviderId = "openrouter";

export function getAgentProvider(id: string | null | undefined): AgentProviderDef | undefined {
  return AGENT_PROVIDERS.find((p) => p.id === id);
}

export function isKnownAgentProvider(id: string): id is AgentProviderId {
  return AGENT_PROVIDERS.some((p) => p.id === id);
}

/** Normalise une base URL : trim, retire le `/` final et un `/chat/completions` collé. */
export function normalizeBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "");
}

/**
 * Base URL effective d'un provider : celle du registre, ou la custom (generic).
 * Renvoie null si generic sans base URL, ou provider inconnu.
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

/** URL de complétion chat OpenAI-compatible pour une base donnée. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}
