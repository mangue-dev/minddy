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
import { AGENT_PROVIDERS } from "@/lib/agent-providers";
import { BYOK_MODEL_KEYS, byokFeatureDefaultModelKey } from "@/lib/ai-surfaces";
import { DEFAULT_SUBAGENT_FAVORITES } from "@/lib/subagent-favorites";
import { DEFAULT_RECOMMENDED_MODELS } from "@/lib/recommended-models";
import { DEFAULT_REASONING_LEVEL } from "@/lib/agent-reasoning";

/**
 * `model` → id `provider/model` chosen in the platform key catalog;
 * `modelId` → id entered as is, in the namespace of a BYOK provider (`gpt-…`,
 * `claude-…`): the platform catalog would write invalid ids;
 * `favorites` → JSON list of `FavoriteSubagentModel`;
 * `recommended` → JSON list of ids, in the order of display of the picker ;
 * `reasoning` → one of the shared Numo reasoning levels;
 * `flag` → “true”/”false” switch.
 */
export type AiConfigKind =
  | "model"
  | "modelId"
  | "reasoning"
  | "favorites"
  | "recommended"
  | "flag";

export type AiConfigGroup = "assistant" | "automations" | "agent" | "byok" | "voice" | "feedback";

export interface AiConfigField {
  /** `app_config` key. */
  key: string;
  kind: AiConfigKind;
  /** Value used at runtime when the row is unset (the literal written in code). */
  fallback: string;
  /** Section the field is grouped under in the dashboard. */
  group: AiConfigGroup;
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

export const ASSISTANT_REASONING_CONFIG_KEY = "assistant_reasoning_level";

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
  {
    key: "automation_agent_model",
    kind: "model",
    fallback: "deepseek/deepseek-v4-flash",
    group: "automations",
    noSuffix: true,
  },
  // Smart-fill (lib/server/smart-fill.ts, MIN-260): ONE call per ticket created at
  // the hand, on its sole title + its description, and which gives priority, effort,
  // categories and objective. He holds the person in front of his screen (the line
  // is only inserted once completed): it therefore needs a FAST model, not
  // a clever model — the task is tidying up, not reasoning. The flag
  // cuts it everywhere at once, and the form falls back to hand entry.
  { key: "smart_fill_enabled", kind: "flag", fallback: "true", group: "automations" },
  { key: "smart_fill_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Title of a Numo conversation (lib/server/assistant/title.ts): a call from
  // a few dozen tokens per new conversation — a small model is enough,
  // and that's exactly the kind of call where a big guy doesn't justify himself.
  { key: "conversation_title_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Correspondance des colonnes d'un import CSV (lib/server/import-mapping-ai.ts) :
  // ONE call per file submitted, never per line — the model only sees one
  // column summary. It is the price of an import which loses nothing, and the
  // flag cuts it everywhere at once (the import then falls back onto its tables
  // alias, as before).
  { key: "import_map_enabled", kind: "flag", fallback: "true", group: "automations" },
  { key: "import_map_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Breaking a brief into objectives + tickets (lib/server/brief-to-issues.ts,
  // MIN-172): ONE call per pasted brief, never per ticket — the model renders the
  // lot entier d'un coup, ce que vingt `create_issue` en file ne feraient ni au
  // same price nor at the same latency. The flag cuts her everywhere at once:
  // the start of a new project then falls on import and manual entry.
  { key: "brief_enabled", kind: "flag", fallback: "true", group: "automations" },
  { key: "brief_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "automations" },
  // Web search (tool `web_search` from Numo and agents): the model that reads
  // the results of the OpenRouter plugin. The flag cuts her everywhere at once.
  { key: "web_search_enabled", kind: "flag", fallback: "true", group: "assistant" },
  { key: "web_search_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Cloud Code Agent (MIN-46) — root default, overloaded by user then by run.
  // No suffix (MIN-263): the model of a run is written on its line
  // `agent_runs` and returns for dozens of rounds, sometimes from the
  // microVM — the fallback “replay without the `:`” would mean rewriting the
  // model of the run in flight, which is another project.
  {
    key: "agent_model",
    kind: "model",
    fallback: "deepseek/deepseek-v4-flash",
    group: "agent",
    noSuffix: true,
  },
  // Review of a PR by Numo (MIN-141). DELIBERATELY more expensive than `agent_model`:
  // rereading code with the model that just wrote it only produces a second
  // identical review — the value of a review comes from another perspective. A call by
  // click, never automatic: this is what makes the price sustainable.
  // No suffix either: same loop, same persistent run as `agent_model`.
  {
    key: "pr_review_model",
    kind: "model",
    fallback: "anthropic/claude-sonnet-5",
    group: "agent",
    noSuffix: true,
  },
  // Favorites served at parent prompt for `spawn_agent` (MIN-112).
  {
    key: "agent_subagent_favorites",
    kind: "favorites",
    fallback: JSON.stringify(DEFAULT_SUBAGENT_FAVORITES),
    group: "agent",
  },
  // RECOMMENDED models, shown at the top of the picker when opened
  // (see lib/recommended-models.ts). Not to be confused with favorites
  // above, which are from PROMPT: these are from the UI, read by a human who
  // chooses what to launch its agent on. They don't restrict anything — the catalog
  // integer remains a search.
  {
    key: "recommended_models",
    kind: "recommended",
    fallback: JSON.stringify(DEFAULT_RECOMMENDED_MODELS),
    group: "agent",
  },
  // Border faults of BYOK providers: what happens to an account that has installed
  // key without ever choosing a model. NATIVE IDs of the provider (not `vendor/model`).
  { key: "byok_default_model_openai", kind: "modelId", fallback: byokFallback("openai"), group: "byok" },
  { key: "byok_default_model_anthropic", kind: "modelId", fallback: byokFallback("anthropic"), group: "byok" },
  { key: "byok_default_model_google", kind: "modelId", fallback: byokFallback("google"), group: "byok" },
  // Voice (dictation → ticket)
  { key: "dictate_model", kind: "model", fallback: "google/gemini-3.1-flash-lite", group: "voice" },
  { key: "transcription_model", kind: "model", fallback: "openai/whisper-large-v3", group: "voice" },
  // Landing dictation demo (MIN-150): the only AI call we offer to a
  // visitor WITHOUT ACCOUNT. The flag cuts it everywhere at once, without
  // deployment — this is the last resort safeguard if the endpoint is open
  // gets shot (the others, by IP and by day, are in the way).
  { key: "demo_dictation_enabled", kind: "flag", fallback: "true", group: "voice" },
  // Board de feedback
  { key: "feedback_classify_enabled", kind: "flag", fallback: "true", group: "feedback" },
  // Dictate feedback, on the public board as well as in the dashboard. It turns on
  // the two voice models (`transcription_model` then `dictate_model`):
  // it's the same take, stored in other fields. The flag cuts it
  // everywhere at once — the microphone disappears, the writing remains.
  { key: "feedback_voice_enabled", kind: "flag", fallback: "true", group: "feedback" },
  { key: "feedback_analysis_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "feedback" },
  { key: "feedback_embedding_model", kind: "model", fallback: "openai/text-embedding-3-small", group: "feedback" },
];

/**
 * Provider × call type matrix. OpenRouter is absent: its default is, by
 * definition, the platform setting of the same type. Empty fields of a generic
 * provider force the account to choose an id of its endpoint.
 */
for (const provider of AGENT_PROVIDERS.filter((entry) => entry.id !== "openrouter")) {
  for (const modelKey of BYOK_MODEL_KEYS) {
    let fallback = provider.defaultModel ?? "";
    if (modelKey === "transcription_model") {
      fallback = provider.id === "openai" ? "gpt-4o-mini-transcribe" : "";
    } else if (modelKey === "feedback_embedding_model") {
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
      adminLabel: `${provider.label} · ${modelKey}`,
    });
  }
}

/** Display order of the dashboard sections. */
export const AI_MODEL_CONFIG_GROUPS: AiConfigGroup[] = [
  "assistant",
  "automations",
  "agent",
  "byok",
  "voice",
  "feedback",
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

export function isFlagKey(key: string): boolean {
  return getAiConfigField(key)?.kind === "flag";
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

/** `app_config` key for the border fault of a BYOK provider. */
export function byokDefaultModelKey(providerId: string): string {
  return `byok_default_model_${providerId}`;
}

/** Border fault written in the providers register (`lib/agent-providers.ts`). */
function byokFallback(providerId: string): string {
  const model = getProviderDefaultModel(providerId);
  if (!model) throw new Error(`Provider ${providerId} has no default model`);
  return model;
}
