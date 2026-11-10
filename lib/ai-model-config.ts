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
import { AGENT_PROVIDERS } from "@/lib/agent-providers";
import {
  NUMO_WAKE_DAILY_LIMIT_DEFAULT,
  NUMO_WAKE_DAILY_LIMIT_KEY,
  NUMO_WAKE_DAILY_LIMIT_MAX,
} from "@/lib/numo-background";
import {
  ROLE_USAGE_KEYS,
  byokFeatureDefaultModelKey,
  isByokModelKey,
  roleUsageKey,
} from "@/lib/ai-surfaces";
import { DEFAULT_REASONING_LEVEL } from "@/lib/agent-reasoning";
import {
  modelCatalogCapabilityForKey,
  providerSupportsModelKey,
  type AdminCatalogCapability,
} from "@/lib/model-catalog-capability";

/**
 * `model` → id `provider/model` chosen in the platform key catalog;
 * `modelId` → id entered as is, in the namespace of a BYOK provider (`gpt-…`,
 * `claude-…`): the platform catalog would write invalid ids;
 * `reasoning` → one of the shared Numo reasoning levels;
 * `count` → a whole number from 0 to `max` (a cap, not a model).
 *
 * There is no on/off switch here: every AI feature is always on (MIN-733).
 */
export type AiConfigKind =
  | "model"
  | "modelId"
  | "reasoning"
  /** A whole number, such as a daily cap. Not part of the models file. */
  | "count";

/**
 * The dashboard sections (MIN-954): one per model role, plus the defaults of
 * personal keys. The LLM section also holds Numo's reasoning level, its
 * background cap.
 */
export type AiConfigGroup =
  | "assistant"
  | "embeddings"
  | "voice"
  | "decision"
  | "byok";

export interface AiConfigField {
  /** `app_config` key. */
  key: string;
  kind: AiConfigKind;
  /** Value used at runtime when the row is unset (the literal written in code). */
  fallback: string;
  /** Section the field is grouped under in the dashboard. */
  group: AiConfigGroup;
  /**
   * Restricts the admin picker to models usable by this runtime call. A
   * `decision` field is also validated on save (`/api/admin/app-config`).
   */
  catalogCapability?: AdminCatalogCapability;
  /** Technical label generated for provider × feature defects. */
  adminLabel?: string;
  /** Highest value of a `count`. */
  max?: number;
}

/**
 * Category defaults of MIN-829, retired by MIN-954. Still READ for their
 * role, below the role's own row, so an instance that only set a category
 * keeps the model it runs until an administrator picks one.
 */
const LEGACY_CATEGORY_KEYS: Record<string, string> = {
  assistant_model: "category_assistant_model",
  issue_embedding_model: "category_embeddings_model",
};

/**
 * Model keys that are not personal-key call types but still run the LLM:
 * the public FAQ box, merge commit messages, and the retired fallback model.
 */
const OTHER_LLM_KEYS = new Set(["faq_ask_model", "merge_message_model", "fallback_model"]);

/**
 * The `app_config` key that holds the model of `key`'s role (MIN-954): every
 * text task reads `assistant_model`, both embedding indexes read
 * `issue_embedding_model`. Other keys are their own.
 */
export function roleModelKey(key: string): string {
  if (isByokModelKey(key)) return roleUsageKey(key);
  return OTHER_LLM_KEYS.has(key) ? ROLE_USAGE_KEYS.llm : key;
}

/**
 * OpenRouter routing shortcuts (MIN-263): `:nitro`, `:floor` and `:exacto`
 * order the providers of one model. The dashboard no longer sets them
 * (MIN-954), but a model id may still carry one: a refused call is replayed
 * on the bare id (`stripModelSuffix`).
 */
const MODEL_SUFFIXES = ["nitro", "floor", "exacto"] as const;

type ModelSuffix = (typeof MODEL_SUFFIXES)[number];

function isModelSuffix(value: string): value is ModelSuffix {
  return (MODEL_SUFFIXES as readonly string[]).includes(value);
}

/**
 * Origin (×1) of the model cost multiplier that plan caps are expressed in
 * (`lib/model-multiplier.ts`, `BillingPlan.maxModelMultiplier`): Numo's
 * model, as configured in the admin dashboard (its code fallback when unset).
 * Changing that model moves the whole scale, and the caps in
 * `lib/billing-plans.ts` are read against the new price.
 */
export const PRICING_BASELINE_CONFIG_KEY = "assistant_model";

export const ASSISTANT_REASONING_CONFIG_KEY = "assistant_reasoning_level";

/** The global decision model (MIN-694); historical key name, see the registry entry. */
export const DECISION_MODEL_CONFIG_KEY = "jev_model";

/**
 * The registry (MIN-954): one model per role, never one per task. Every text
 * task — Numo, conversation titles, web search, background screening, the
 * home summary, Smart Fill, Smart Assign, relation decisions, CSV mapping,
 * brief breakdown, merge messages, voice cleanup, feedback review, the FAQ
 * box — runs `assistant_model`; both embedding indexes run
 * `issue_embedding_model`. `roleModelKey` maps every historical key to its
 * role, so callers keep asking for their own key.
 */
export const AI_MODEL_CONFIG_FIELDS: AiConfigField[] = [
  // The LLM: Numo and every text task. Its reasoning level is Numo's.
  { key: "assistant_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  {
    key: ASSISTANT_REASONING_CONFIG_KEY,
    kind: "reasoning",
    fallback: DEFAULT_REASONING_LEVEL,
    group: "assistant",
  },
  // Background Numo (lib/server/numo/wake.ts, MIN-929): background turns one
  // user gets in 24 hours. Past it, a due batch closes without waking Numo.
  // 0 turns background Numo off on the instance.
  {
    key: NUMO_WAKE_DAILY_LIMIT_KEY,
    kind: "count",
    fallback: String(NUMO_WAKE_DAILY_LIMIT_DEFAULT),
    max: NUMO_WAKE_DAILY_LIMIT_MAX,
    group: "assistant",
  },
  // Embeddings: issues (search by meaning, relations, MIN-717) and feedback
  // (similar posts) share one model. Changing it versions each index
  // (provider:model:dimensions): old vectors are never compared with new ones.
  {
    key: "issue_embedding_model",
    kind: "model",
    fallback: "openai/text-embedding-3-small",
    group: "embeddings",
    catalogCapability: "embedding",
  },
  // Speech to text, for every dictation; the cleanup that follows is LLM work.
  {
    key: "transcription_model",
    kind: "model",
    fallback: "openai/whisper-large-v3",
    group: "voice",
    catalogCapability: "transcription",
  },
  // AI decision layer (MIN-557, MIN-694): ONE decision model for the whole
  // instance — Smart Fill, Smart Assign, relation decisions, background
  // screening and the feedback review all read it. A decision model answers
  // typed questions over a structured state on OpenRouter's decisions
  // endpoint. The picker lists only models publishing the `decisions` output
  // modality, and the save probes the candidate before writing it. The
  // `jev_*` key names are historical, kept so existing rows carry over; Jev
  // stays the default.
  {
    key: DECISION_MODEL_CONFIG_KEY,
    kind: "model",
    fallback: "typesafe/jev-1.13",
    group: "decision",
    catalogCapability: "decision",
  },
];

/**
 * Provider × call type matrix. OpenRouter is absent: its default is, by
 * definition, the platform setting of the same type. Empty fields of a generic
 * provider force the account to choose an id of its endpoint.
 */
for (const provider of AGENT_PROVIDERS.filter((entry) => entry.id !== "openrouter")) {
  for (const modelKey of Object.values(ROLE_USAGE_KEYS)) {
    if (!providerSupportsModelKey(provider.id, modelKey)) continue;
    let fallback = provider.defaultModel ?? "";
    if (modelKey === "transcription_model") {
      // `gpt-4o-mini-transcribe` is deprecated since 2026-08-26 (shutdown
      // 2027-02-26); the OpenAI changelog names `gpt-transcribe` as its
      // replacement on the same /audio/transcriptions endpoint.
      fallback = provider.id === "openai" ? "gpt-transcribe" : "";
    } else if (modelKey === "issue_embedding_model") {
      fallback =
        provider.id === "openai"
          ? "text-embedding-3-small"
          : provider.id === "google"
            ? "gemini-embedding-001"
            : "";
    }
    AI_MODEL_CONFIG_FIELDS.push({
      key: byokFeatureDefaultModelKey(provider.id, modelKey),
      kind: "modelId",
      fallback,
      group: "byok",
      catalogCapability: modelCatalogCapabilityForKey(modelKey),
      adminLabel: `${provider.label} · ${modelKey}`,
    });
  }
}

/** Display order of the dashboard sections. */
export const AI_MODEL_CONFIG_GROUPS: AiConfigGroup[] = [
  "assistant",
  "embeddings",
  "voice",
  "decision",
  "byok",
];

/** The retired category row a role key still reads below its own, if any. */
export function categoryKeyOf(key: string): string | null {
  return LEGACY_CATEGORY_KEYS[key] ?? null;
}

/**
 * The bare id, without its ROUTING suffix — what we replay on after a failure.
 *
 * We only cut `:nitro`, `:floor`, `:exacto`. The colon also serves
 * to denote a pattern VARIANT (`…:free`, `…:thinking`), which is another
 * pattern, not a routing order: cutting it would replay a denial on the
 * paid variant, silently.
 */
export function stripModelSuffix(model: string): string {
  const cut = model.lastIndexOf(":");
  if (cut < 0) return model;
  return isModelSuffix(model.slice(cut + 1)) ? model.slice(0, cut) : model;
}

/** Fast membership check for the admin API (write allowlist). */
export const AI_MODEL_CONFIG_KEYS = new Set(AI_MODEL_CONFIG_FIELDS.map((f) => f.key));

export function getAiConfigField(key: string): AiConfigField | undefined {
  return AI_MODEL_CONFIG_FIELDS.find((f) => f.key === key);
}

/**
 * Default of a setting, to be used when the `app_config` line is absent or empty.
 *
 * Throws on an unknown key: this is a programming fault, not a case of
 * production — better to break on the first call than route silently du
 * traffic to `undefined`.
 */
export function aiModelFallback(key: string): string {
  const field = getAiConfigField(roleModelKey(key));
  if (!field) throw new Error(`Unknown AI config key: ${key}`);
  return field.fallback;
}
