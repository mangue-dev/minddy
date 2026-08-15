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
  /** Nom wire du plafond de sortie. Les surfaces, elles, parlent `maxOutputTokens`. */
  outputTokenField: "max_tokens" | "max_completion_tokens";
  /** Plafond par défaut quand une surface n'en fixe pas un. */
  defaultMaxOutputTokens?: number;
  /** Ajoute les headers d'attribution OpenRouter (HTTP-Referer / X-Title). */
  attribution?: boolean;
  /**
   * Marque le prompt système d'un cache breakpoint `cache_control:{ephemeral}`.
   * Réservé aux providers qui l'acceptent : OpenRouter le transmet aux modèles qui
   * supportent le prompt caching (gros gain sur Claude) et l'ignore sans erreur
   * ailleurs. À NE PAS activer pour les couches compat OpenAI/Anthropic/Gemini
   * directes (risque de rejet du champ).
   */
  promptCaching?: boolean;
  /**
   * Forme du champ de raisonnement acceptée par cet endpoint (MIN-122) : la SEULE
   * gate de la feature — un provider sans ce champ n'en envoie jamais aucun.
   *   `reasoning`        → `reasoning: { effort }` (OpenRouter).
   *   `reasoning_effort` → `reasoning_effort` à plat (OpenAI et Gemini).
   *   `thinking`         → forme model-aware adaptative/manuelle (Anthropic).
   * Le générique reste muet : sa base URL est un serveur inconnu, et un champ
   * refusé revient en 400. Les niveaux et leur traduction : lib/agent-reasoning.ts.
   */
  reasoningField?: "reasoning" | "reasoning_effort" | "thinking";
}

export interface AgentProviderDef {
  id: AgentProviderId;
  label: string;
  /** Base URL OpenAI-compatible (sans `/chat/completions`). Absent = base saisie (generic). */
  baseUrl?: string;
  /** true → l'utilisateur DOIT fournir une base URL (generic). */
  requiresBaseUrl?: boolean;
  /**
   * Modèle par défaut (frontier) de ce provider en BYOK — pré-rempli dans le
   * sélecteur et utilisé comme fallback de résolution (cf. `resolveAgentModel`).
   * Absent pour OpenRouter (reprend le défaut racine = quota minddy) et pour le
   * générique (namespace inconnu → l'utilisateur doit choisir).
   *
   * REPLI seulement : un admin le change depuis /admin sans redéploiement (clé
   * `byok_default_model_<provider>`, cf. `resolveProviderDefaultModel`). Ce qui
   * tourne vraiment se lit là, pas ici.
   */
  defaultModel?: string;
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
    // Pas de défaut propre : reprend le défaut racine app_config.agent_model,
    // exactement comme le quota minddy (même endpoint OpenRouter).
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
    // La couche compat accepte les deux plafonds, mais recommande le contrat
    // OpenAI récent. Le raisonnement garde en revanche la forme Anthropic.
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
    // Un serveur générique peut n'implémenter que l'ancien contrat Chat
    // Completions. On n'y envoie aucune extension de provider.
    requestProfile: { outputTokenField: "max_tokens" },
  },
];

/** Provider par défaut quand aucun BYOK : clé plateforme OpenRouter. */
export const DEFAULT_AGENT_PROVIDER: AgentProviderId = "openrouter";

/**
 * Option « quota minddy » du sélecteur : mode plateforme (aucun BYOK), l'agent
 * tourne sur la clé OpenRouter de minddy dans la limite du plafond mensuel.
 * PSEUDO-provider réservé à l'UI — n'appartient PAS à `AGENT_PROVIDERS` (ce n'est
 * pas un provider BYOK ; côté serveur, « quota minddy » = absence de clé BYOK).
 */
export const MINDDY_QUOTA_PROVIDER_ID = "minddy";

export function getAgentProvider(id: string | null | undefined): AgentProviderDef | undefined {
  return AGENT_PROVIDERS.find((p) => p.id === id);
}

/**
 * Modèle par défaut (frontier) d'un provider, ou undefined s'il n'en a pas de
 * propre : OpenRouter (reprend le défaut racine = quota minddy) et le générique.
 */
export function getProviderDefaultModel(id: string | null | undefined): string | undefined {
  return getAgentProvider(id)?.defaultModel;
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
