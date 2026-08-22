/**
 * The model list of a NATIVE BYOK provider (OpenAI, Anthropic, Google), as
 * the admin "Models" tab proposes it (MIN-416).
 *
 * Source: the public OpenRouter index (`/api/v1/models`, readable without a
 * key — see lib/server/agent/openrouter-index.ts). Each entry carries a
 * `vendor/model` id; a BYOK field expects the PROVIDER's own namespace
 * (`claude-sonnet-5`, not `anthropic/claude-sonnet-5`), so the prefix is
 * stripped after filtering. This keeps the list automatically current —
 * neither Anthropic nor OpenAI publishes their catalog without credentials,
 * while OpenRouter's mirrors both within hours.
 *
 * Pure module: no server-only import, shared by the API route (server) and
 * the admin dashboard (client). The fetch itself lives server-side.
 */
import { dedupeModelVariants } from "@/lib/model-variants";
import { BYOK_MODEL_KEYS, type ByokModelKey } from "@/lib/ai-surfaces";

/** Providers whose native ids can be derived from an OpenRouter `vendor/…` id. */
export const BYOK_CATALOG_PROVIDERS = ["openai", "anthropic", "google"] as const;

export type ByokCatalogProvider = (typeof BYOK_CATALOG_PROVIDERS)[number];

/** OpenRouter's vendor segment for each supported provider. */
const VENDOR_PREFIXES: Record<ByokCatalogProvider, string> = {
  openai: "openai/",
  anthropic: "anthropic/",
  google: "google/",
};

/** Same exclusion as the platform catalogs: embeddings, audio, image… are not conversational picks. */
const NON_CHAT_RE =
  /(embed(?:ding)?|whisper|tts|dall-e|moderation|audio|image|imagen|veo|realtime|transcribe|rerank)/i;

/** Minimal shape this module needs from an index entry. */
export interface ByokCatalogSourceModel {
  id: string;
  name?: string;
  /** Router entries (`openrouter/auto`, `~vendor/latest`) are switches, not models. */
  router?: boolean;
  /** Models whose output is not text have no place in a settings picker. */
  textOutput?: boolean;
}

export interface ByokCatalogEntry {
  /** Native id, in the provider's own namespace (`claude-sonnet-5`). */
  id: string;
  /** Display name published by OpenRouter. */
  name: string;
}

/**
 * The provider's native models, derived from an OpenRouter-shaped list:
 * filtered on the vendor prefix, cleared of routers / non-text output /
 * non-chat ids and version duplicates, then stripped of the prefix.
 */
export function byokModelsForProvider(
  models: readonly ByokCatalogSourceModel[],
  provider: ByokCatalogProvider,
): ByokCatalogEntry[] {
  const prefix = VENDOR_PREFIXES[provider];
  return dedupeModelVariants(
    models
      .filter((m) => m.router !== true && m.textOutput !== false)
      .filter((m) => m.id.startsWith(prefix))
      .filter((m) => !NON_CHAT_RE.test(m.id.slice(prefix.length)))
      .map((m) => ({ id: m.id.slice(prefix.length), name: m.name ?? m.id })),
  ).sort((a, b) => a.id.localeCompare(b.id));
}

export function isByokCatalogProvider(value: string | null | undefined): value is ByokCatalogProvider {
  return (BYOK_CATALOG_PROVIDERS as readonly string[]).includes(value ?? "");
}

/**
 * The call-type tail of a BYOK config key (`agent_model`,
 * `transcription_model`…), or `null` for other shapes.
 *
 * Some call-type keys END in another (`automation_agent_model` ends in
 * `agent_model`), so the longest model key wins: matching shortest-first
 * would read the wrong split.
 */
export function modelKeyFromByokConfigKey(key: string): ByokModelKey | null {
  const sortedKeys = [...BYOK_MODEL_KEYS].sort((a, b) => b.length - a.length);
  return sortedKeys.find((modelKey) => key === modelKey || key.endsWith(`_${modelKey}`)) ?? null;
}

/**
 * Which provider a BYOK `app_config` key belongs to, or `null` when the key
 * is not a BYOK default of a catalog-backed provider.
 *
 * Two key shapes exist (lib/ai-model-config.ts):
 * - `byok_default_model_<provider>` — the account-wide border default;
 * - `byok_default_<provider>_<modelKey>` — one per call type
 *   (`byokFeatureDefaultModelKey`, lib/ai-surfaces.ts).
 */
export function byokProviderFromConfigKey(key: string): ByokCatalogProvider | null {
  if (!key.startsWith("byok_default_")) return null;
  const rest = key.slice("byok_default_".length);
  const provider = rest.startsWith("model_")
    ? rest.slice("model_".length)
    : modelKeyFromByokConfigKey(rest)
      ? rest.slice(0, rest.length - modelKeyFromByokConfigKey(rest)!.length - 1)
      : null;
  return isByokCatalogProvider(provider) ? provider : null;
}
