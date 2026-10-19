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
import { BYOK_MODEL_KEYS, byokFeatureDefaultModelKey } from "@/lib/ai-surfaces";
import { DEFAULT_RECOMMENDED_MODELS } from "@/lib/recommended-models";
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
 * `recommended` → JSON list of ids, in the order of display of the picker ;
 * `reasoning` → one of the shared Numo reasoning levels.
 *
 * There is no on/off switch here: every AI feature is always on (MIN-733).
 */
export type AiConfigKind =
  | "model"
  | "modelId"
  | "reasoning"
  | "recommended";

export type AiConfigGroup =
  | "assistant"
  | "automations"
  | "byok"
  | "voice"
  | "feedback"
  | "site";

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
  /**
 * Trims the OpenRouter suffix (MIN-263) on a `model` field that would otherwise accept one. See `MODEL_SUFFIXES` for the reason for each exclusion.
 */
  noSuffix?: true;
  /** Technical label generated for provider × feature defects. */
  adminLabel?: string;
}

/**
 * OpenRouter routing shortcuts (MIN-263): stuck to the model id after
 * colon, they order providers of THIS model without changing one
 * alone. Universal — they work on any id.
 *
 * `nitro` → providers sorted by speed (fastest first);
 * `floor` → sorted by price (cheapest first);
 * `exacto` → quality first, providers whose tool-calling is reliable.
 *
 * `:online` also exists and is DELIBERATELY not offered: it turns on the
 * paid web search (~$0.005 per call, Exa package) on any
 * call, while minddy's search is an explicit tool whose cost
 * is a separate ledger line (`lib/server/web-search.ts`). A suffix that
 * multiplies the price of a conversation title by a thousand has no place in
 * a drop-down list.
 */
export const MODEL_SUFFIXES = ["nitro", "floor", "exacto"] as const;

export type ModelSuffix = (typeof MODEL_SUFFIXES)[number];

export function isModelSuffix(value: string): value is ModelSuffix {
  return (MODEL_SUFFIXES as readonly string[]).includes(value);
}

/**
 * Origin (×1) of the model cost multiplier that plan caps are expressed in
 * (`lib/model-multiplier.ts`, `BillingPlan.maxModelMultiplier`). A code
 * constant, not an admin knob: the caps in `lib/billing-plans.ts` are
 * calibrated against this model's price, so the two change together.
 */
export const PRICING_BASELINE_MODEL = "deepseek/deepseek-v4-flash";

export const ASSISTANT_REASONING_CONFIG_KEY = "assistant_reasoning_level";

/** The global decision model (MIN-694); historical key name, see the registry entry. */
export const DECISION_MODEL_CONFIG_KEY = "jev_model";

export const AI_MODEL_CONFIG_FIELDS: AiConfigField[] = [
  // Numo assistant and text helpers.
  { key: "assistant_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  {
    key: ASSISTANT_REASONING_CONFIG_KEY,
    kind: "reasoning",
    fallback: DEFAULT_REASONING_LEVEL,
    group: "assistant",
  },
  { key: "fallback_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  { key: "smart_assign_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Smart-fill (lib/server/smart-fill.ts, MIN-260): ONE call per ticket created at
  // the hand, on its sole title + its description, and which gives priority, effort,
  // categories and objective. He holds the person in front of his screen (the line
  // is only inserted once completed): it therefore needs a FAST model, not
  // a clever model — the task is tidying up, not reasoning.
  { key: "smart_fill_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Smart Fill relations (lib/server/issue-relation-inference.ts, MIN-717):
  // issues are indexed AFTER they are saved, and a bounded decision pass
  // confirms whether an embedding-retrieved candidate is related, blocks or
  // is blocked by the issue. Its own embedding model, never the feedback
  // one: changing it versions the issue index (provider:model:dimensions)
  // and old vectors are never compared with new ones. The relation model is
  // the LLM fallback of the global decision model.
  {
    key: "issue_embedding_model",
    kind: "model",
    fallback: "openai/text-embedding-3-small",
    group: "automations",
    catalogCapability: "embedding",
  },
  { key: "issue_relation_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Title of a Numo conversation (lib/server/assistant/title.ts): a call from
  // a few dozen tokens per new conversation — a small model is enough,
  // and that's exactly the kind of call where a big guy doesn't justify himself.
  { key: "conversation_title_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Correspondance des colonnes d'un import CSV (lib/server/import-mapping-ai.ts) :
  // ONE call per file submitted, never per line — the model only sees one
  // column summary. It is the price of an import which loses nothing.
  { key: "import_map_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Breaking a brief into objectives + tickets (lib/server/brief-to-issues.ts,
  // MIN-172): ONE call per pasted brief, never per ticket — the model renders the
  // lot entier d'un coup, ce que vingt `create_issue` en file ne feraient ni au
  // same price nor at the same latency.
  { key: "brief_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // AI decision layer (MIN-557, MIN-694): ONE decision model for the whole
  // instance — Smart Fill, Smart Assign and the feedback review all read it,
  // nothing selects a model per project, user or use case. A decision model
  // answers typed questions over a structured state on OpenRouter's decisions
  // endpoint (docs/plans/min-561-jev-prerequisites.md for the access path,
  // docs/plans/min-694-decision-model-selection.md for the verified models).
  // The picker lists only models publishing the `decisions` output modality,
  // and the save probes the candidate before writing it. The `jev_*` key
  // names are historical, kept so existing rows carry over; Jev stays the
  // default. Per MIN-557 there is no “fast/normal” switch; `jev_llm_first`
  // (outside this registry) sends a use case straight to its LLM pass. No suffix (MIN-263): the chat
  // routing shortcuts mean nothing on the decisions endpoint, and a failed
  // decision replays as a NEW call, never as a variant id.
  {
    key: DECISION_MODEL_CONFIG_KEY,
    kind: "model",
    fallback: "typesafe/jev-1.13",
    group: "automations",
    catalogCapability: "decision",
    noSuffix: true,
  },
  // Web search (tool `web_search` from Numo and agents): the model that reads
  // the results of the OpenRouter plugin.
  { key: "web_search_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Commit message of a merge generated with "Numo" (MIN-548): ONE call per
  // merge prepared, on the diff of the PR + its commits, and which returns
  // the title and the message in a single forced call. The admin model is
  // the only lever — the gesture merges AS SOON AS the generation lands, so
  // a clever model is not needed; a fast, cheap one is.
  { key: "merge_message_model", kind: "model", fallback: "z-ai/glm-5.3", group: "automations" },
  // RECOMMENDED models, shown at the top of the model picker when opened
  // (see lib/recommended-models.ts), read by a human choosing a model. They
  // don't restrict anything — the whole catalog remains searchable.
  {
    key: "recommended_models",
    kind: "recommended",
    fallback: JSON.stringify(DEFAULT_RECOMMENDED_MODELS),
    group: "assistant",
  },
  // Voice (speech-to-text → destination-aware cleanup and structured drafts)
  { key: "dictate_model", kind: "model", fallback: "google/gemini-3.1-flash-lite", group: "voice" },
  {
    key: "transcription_model",
    kind: "model",
    fallback: "openai/whisper-large-v3",
    group: "voice",
    catalogCapability: "transcription",
  },
  // Feedback board. Dictating feedback, on the public board as well as in the
  // dashboard, runs the two voice models (`transcription_model` then
  // `dictate_model`): it's the same take, stored in other fields.
  { key: "feedback_analysis_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "feedback" },
  {
    key: "feedback_embedding_model",
    kind: "model",
    fallback: "openai/text-embedding-3-small",
    group: "feedback",
    catalogCapability: "embedding",
  },
  // FAQ ask box (MIN-590): an AI answer to a visitor's own question, offered
  // on every public page that carries a FAQ section. It is anonymous traffic
  // on the public site — like the landing demo it is bounded by an IP meter
  // and a per-instance daily ceiling, and it stays on the
  // cheap fast model of the registry: one small completion per question.
  { key: "faq_ask_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "site" },
];

/**
 * Provider × call type matrix. OpenRouter is absent: its default is, by
 * definition, the platform setting of the same type. Empty fields of a generic
 * provider force the account to choose an id of its endpoint.
 */
for (const provider of AGENT_PROVIDERS.filter((entry) => entry.id !== "openrouter")) {
  for (const modelKey of BYOK_MODEL_KEYS) {
    if (!providerSupportsModelKey(provider.id, modelKey)) continue;
    let fallback = provider.defaultModel ?? "";
    if (modelKey === "transcription_model") {
      // `gpt-4o-mini-transcribe` is deprecated since 2026-08-26 (shutdown
      // 2027-02-26); the OpenAI changelog names `gpt-transcribe` as its
      // replacement on the same /audio/transcriptions endpoint.
      fallback = provider.id === "openai" ? "gpt-transcribe" : "";
    } else if (modelKey === "feedback_embedding_model" || modelKey === "issue_embedding_model") {
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
  "automations",
  "byok",
  "voice",
  "feedback",
  "site",
];

/**
 * Does a field accept a routing suffix? Models except those marked
 * `noSuffix`. BYOK ids (`kind: "modelId"`) live in the namespace of a native
 * provider, where OpenRouter shortcuts do not exist.
 */
export function isSuffixableField(field: AiConfigField): boolean {
  return field.kind === "model" && !field.noSuffix;
}

/**
 * `app_config` key for the suffix of a template setting. It is DERIVED, not
 * declared: a `model` field added to the register gains its suffix without
 * having a second entry to match.
 */
export function modelSuffixKey(key: string): string {
  return `${key}_suffix`;
}

/** The registry suffix keys, in the order of their fields. */
export const AI_MODEL_SUFFIX_KEYS: string[] = AI_MODEL_CONFIG_FIELDS.filter(
  isSuffixableField,
).map((f) => modelSuffixKey(f.key));

/** Is this key the suffix of a registry field? */
export function isModelSuffixKey(key: string): boolean {
  return AI_MODEL_SUFFIX_KEYS.includes(key);
}

/**
 * Pastes a routing suffix to a template id. No-op when there is no
 * suffix, when it is not recognized (a handwritten `app_config` * line should not break the call), or when the id ALREADY has one: an admin who has
 * entered `…:free` in free text has chosen one variant, not a routing order,
 * and `…:free:nitro` does not exist.
 */
export function applyModelSuffix(model: string, suffix: string | null | undefined): string {
  const base = model.trim();
  const wanted = (suffix ?? "").trim();
  if (!base || !wanted || !isModelSuffix(wanted)) return base;
  if (base.includes(":")) return base;
  return `${base}:${wanted}`;
}

/**
 * The bare id, without its ROUTING suffix — what we replay on after a failure.
 *
 * We only cut `:nitro`, `:floor`, `:exacto`. The colon also serves
 * to denote a pattern VARIANT (`…:free`, `…:thinking`), which is another
 * pattern, not a routing order: cutting it would replay a denial on the
 * paid variant, silently. `applyModelSuffix` already refuses to paste a
 * shortcut to an id that has a `:` — both halves say the same thing.
 */
export function stripModelSuffix(model: string): string {
  const cut = model.lastIndexOf(":");
  if (cut < 0) return model;
  return isModelSuffix(model.slice(cut + 1)) ? model.slice(0, cut) : model;
}

/** Fast membership check for the admin API (write allowlist). */
export const AI_MODEL_CONFIG_KEYS = new Set([
  ...AI_MODEL_CONFIG_FIELDS.map((f) => f.key),
  ...AI_MODEL_SUFFIX_KEYS,
]);

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
  const field = getAiConfigField(key);
  if (!field) throw new Error(`Unknown AI config key: ${key}`);
  return field.fallback;
}
