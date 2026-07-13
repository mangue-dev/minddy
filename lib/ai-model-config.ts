/**
 * The AI knobs an admin can tune from the dashboard (`/admin`) — the single
 * source of truth shared by the admin API (allowed keys + validation) and the
 * admin UI (fields to render). Each entry maps 1:1 to a row in the `app_config`
 * key/value table (read/written via `lib/server/app-config.ts`).
 *
 * NO server-only imports here: this module is pulled into the client dashboard.
 * Keep it a plain data registry.
 *
 * `fallback` mirrors the default shipped in the migration `insert` for that key
 * — the value used at runtime when the row is unset — and is surfaced in the UI
 * as the input placeholder so an admin sees what "empty" resolves to.
 */
export type AiConfigKind = "model" | "flag";

export type AiConfigGroup = "assistant" | "voice" | "feedback";

export interface AiConfigField {
  /** `app_config` key. */
  key: string;
  /** `model` → free-text `provider/model` id; `flag` → "true"/"false" switch. */
  kind: AiConfigKind;
  /** Value used at runtime when the row is unset (mirrors the migration default). */
  fallback: string;
  /** Section the field is grouped under in the dashboard. */
  group: AiConfigGroup;
}

export const AI_MODEL_CONFIG_FIELDS: AiConfigField[] = [
  // Assistant Numo + helpers texte
  { key: "assistant_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  { key: "fallback_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  { key: "smart_assign_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "assistant" },
  // Voix (dictée → ticket)
  { key: "dictate_model", kind: "model", fallback: "google/gemini-3.1-flash-lite", group: "voice" },
  { key: "transcription_model", kind: "model", fallback: "openai/whisper-large-v3", group: "voice" },
  // Board de feedback
  { key: "feedback_classify_enabled", kind: "flag", fallback: "true", group: "feedback" },
  { key: "feedback_classify_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "feedback" },
  { key: "feedback_analysis_model", kind: "model", fallback: "deepseek/deepseek-v4-flash", group: "feedback" },
  { key: "feedback_embedding_model", kind: "model", fallback: "openai/text-embedding-3-small", group: "feedback" },
];

/** Display order of the dashboard sections. */
export const AI_MODEL_CONFIG_GROUPS: AiConfigGroup[] = ["assistant", "voice", "feedback"];

/** Fast membership check for the admin API (write allowlist). */
export const AI_MODEL_CONFIG_KEYS = new Set(AI_MODEL_CONFIG_FIELDS.map((f) => f.key));

export function isFlagKey(key: string): boolean {
  return AI_MODEL_CONFIG_FIELDS.find((f) => f.key === key)?.kind === "flag";
}
