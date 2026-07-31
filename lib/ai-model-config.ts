/**
 * The AI knobs an admin can tune from the dashboard (`/admin`) — the single
 * source of truth shared by the admin API (allowed keys + validation) and the
 * admin UI (fields to render). Each entry maps 1:1 to a row in the `app_config`
 * key/value table (read/written via `lib/server/app-config.ts`).
 *
 * NO server-only imports here: this module is pulled into the client dashboard.
 * Keep it a plain data registry.
 *
 * `fallback` is the value used at runtime when the row is unset — the literal
 * written in code, mirrored by the migration `insert` for the keys that have one
 * (the newer keys have no seeded row at all). It is surfaced in the UI as the
 * placeholder so an admin sees what "empty" resolves to. **This is the ONLY
 * place a model id is written in code**: every caller reads its own from here
 * via `aiModelFallback` instead of redeclaring the constant on its side.
 */
import { getProviderDefaultModel } from "@/lib/agent-providers";
import { DEFAULT_SUBAGENT_FAVORITES } from "@/lib/subagent-favorites";

/**
 * `model`     → id `provider/model` choisi dans le catalogue de la clé plateforme ;
 * `modelId`   → id saisi tel quel, dans le namespace d'un provider BYOK (`gpt-…`,
 *               `claude-…`) : le catalogue plateforme y écrirait des ids invalides ;
 * `favorites` → liste JSON de `FavoriteSubagentModel` ;
 * `flag`      → interrupteur "true"/"false".
 */
export type AiConfigKind = "model" | "modelId" | "favorites" | "flag";

export type AiConfigGroup = "assistant" | "agent" | "byok" | "voice" | "feedback";

export interface AiConfigField {
  /** `app_config` key. */
  key: string;
  kind: AiConfigKind;
  /** Value used at runtime when the row is unset (the literal written in code). */
  fallback: string;
  /** Section the field is grouped under in the dashboard. */
  group: AiConfigGroup;
}

export const AI_MODEL_CONFIG_FIELDS: AiConfigField[] = [
  // Assistant Numo + helpers texte
  { key: "assistant_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  { key: "fallback_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  { key: "smart_assign_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Recherche web (tool `web_search` de Numo et des agents) : le modèle qui lit
  // les résultats du plugin OpenRouter. Le drapeau la coupe partout d'un coup.
  { key: "web_search_enabled", kind: "flag", fallback: "true", group: "assistant" },
  { key: "web_search_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Agent de code cloud (MIN-46) — défaut racine, surchargé par user puis par run
  { key: "agent_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "agent" },
  // Review d'une PR par Numo (MIN-141). DÉLIBÉRÉMENT plus cher que `agent_model` :
  // relire du code avec le modèle qui vient de l'écrire ne produit qu'un second
  // avis identique — la valeur d'une review vient d'un autre regard. Un appel par
  // clic, jamais automatique : c'est ce qui rend le tarif tenable.
  { key: "pr_review_model", kind: "model", fallback: "anthropic/claude-sonnet-5", group: "agent" },
  // Favoris servis au prompt du parent pour `spawn_agent` (MIN-112).
  {
    key: "agent_subagent_favorites",
    kind: "favorites",
    fallback: JSON.stringify(DEFAULT_SUBAGENT_FAVORITES),
    group: "agent",
  },
  // Défauts frontier des providers BYOK : ce que tourne un compte qui a posé sa
  // clé sans jamais choisir de modèle. Ids NATIFS du provider (pas `vendor/model`).
  { key: "byok_default_model_openai", kind: "modelId", fallback: byokFallback("openai"), group: "byok" },
  { key: "byok_default_model_anthropic", kind: "modelId", fallback: byokFallback("anthropic"), group: "byok" },
  { key: "byok_default_model_google", kind: "modelId", fallback: byokFallback("google"), group: "byok" },
  // Voix (dictée → ticket)
  { key: "dictate_model", kind: "model", fallback: "google/gemini-3.1-flash-lite", group: "voice" },
  { key: "transcription_model", kind: "model", fallback: "openai/whisper-large-v3", group: "voice" },
  // Board de feedback
  { key: "feedback_classify_enabled", kind: "flag", fallback: "true", group: "feedback" },
  { key: "feedback_analysis_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "feedback" },
  { key: "feedback_embedding_model", kind: "model", fallback: "openai/text-embedding-3-small", group: "feedback" },
];

/** Display order of the dashboard sections. */
export const AI_MODEL_CONFIG_GROUPS: AiConfigGroup[] = [
  "assistant",
  "agent",
  "byok",
  "voice",
  "feedback",
];

/** Fast membership check for the admin API (write allowlist). */
export const AI_MODEL_CONFIG_KEYS = new Set(AI_MODEL_CONFIG_FIELDS.map((f) => f.key));

export function getAiConfigField(key: string): AiConfigField | undefined {
  return AI_MODEL_CONFIG_FIELDS.find((f) => f.key === key);
}

export function isFlagKey(key: string): boolean {
  return getAiConfigField(key)?.kind === "flag";
}

/**
 * Défaut d'un réglage, à servir quand la ligne `app_config` est absente ou vide.
 *
 * Lève sur une clé inconnue : c'est une faute de programmation, pas un cas de
 * production — mieux vaut casser au premier appel que router silencieusement du
 * trafic vers `undefined`.
 */
export function aiModelFallback(key: string): string {
  const field = getAiConfigField(key);
  if (!field) throw new Error(`Unknown AI config key: ${key}`);
  return field.fallback;
}

/** Clé `app_config` du défaut frontier d'un provider BYOK. */
export function byokDefaultModelKey(providerId: string): string {
  return `byok_default_model_${providerId}`;
}

/** Défaut frontier écrit dans le registre des providers (`lib/agent-providers.ts`). */
function byokFallback(providerId: string): string {
  const model = getProviderDefaultModel(providerId);
  if (!model) throw new Error(`Provider ${providerId} has no default model`);
  return model;
}
