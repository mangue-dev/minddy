/**
 * The AI ​​surfaces that an account can pass on its BYOK key (MIN-366).
 * This module remains pure: the API, client settings and server runtime
 * share exactly the same identifiers and the same default values.
 */

export const AI_SURFACES = ["agent", "assistant", "automations", "voice", "feedback"] as const;

export type AiSurface = (typeof AI_SURFACES)[number];

/** An existing or newly created key covers everything as long as the user does not uncheck anything. */
export const DEFAULT_BYOK_SURFACES: AiSurface[] = [...AI_SURFACES];

/**
 * Call types whose template may differ. They correspond to the real
 * platform settings in app_config; OpenRouter BYOK can therefore take the
 * Minddy value of the same name without a fragile correspondence table.
 */
export const BYOK_MODEL_KEYS = [
  "agent_model",
  "automation_agent_model",
  "pr_review_model",
  "assistant_model",
  "conversation_title_model",
  "web_search_model",
  "smart_assign_model",
  "smart_fill_model",
  "import_map_model",
  "brief_model",
  "dictate_model",
  "transcription_model",
  "feedback_analysis_model",
  "feedback_embedding_model",
] as const;

export type ByokModelKey = (typeof BYOK_MODEL_KEYS)[number];
export type ByokFeatureModels = Partial<Record<ByokModelKey, string>>;

export interface AiSurfaceDefinition {
  id: AiSurface;
  modelKeys: readonly ByokModelKey[];
}

export const AI_SURFACE_DEFINITIONS: readonly AiSurfaceDefinition[] = [
  // The agent model and its reasoning already have their dedicated group just below
  // surfaces in /settings; we do not make two concurrent controls.
  { id: "agent", modelKeys: [] },
  {
    id: "assistant",
    modelKeys: ["assistant_model", "conversation_title_model", "web_search_model"],
  },
  {
    id: "automations",
    modelKeys: [
      "automation_agent_model",
      "smart_assign_model",
      "smart_fill_model",
      "import_map_model",
      "brief_model",
    ],
  },
  { id: "voice", modelKeys: ["dictate_model", "transcription_model"] },
  {
    id: "feedback",
    modelKeys: ["feedback_analysis_model", "feedback_embedding_model"],
  },
] as const;

const AI_SURFACE_SET = new Set<string>(AI_SURFACES);
const BYOK_MODEL_KEY_SET = new Set<string>(BYOK_MODEL_KEYS);

export function isAiSurface(value: string): value is AiSurface {
  return AI_SURFACE_SET.has(value);
}

export function isByokModelKey(value: string): value is ByokModelKey {
  return BYOK_MODEL_KEY_SET.has(value);
}

/** App_config key of the pre-selected model for a native provider. */
export function byokFeatureDefaultModelKey(provider: string, modelKey: ByokModelKey): string {
  return `byok_default_${provider}_${modelKey}`;
}

/** Validation stricte d'un payload API. Un tableau vide signifie « quota Minddy partout ». */
export function parseAiSurfaces(value: unknown): AiSurface[] | null {
  if (!Array.isArray(value)) return null;
  const result: AiSurface[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !isAiSurface(entry) || result.includes(entry)) return null;
    result.push(entry);
  }
  return result;
}

/**
 * Normalizes the template map sent by the account. An empty string clears the
 * choice and lets the default admin win; unknown keys are refused.
 */
export function parseByokFeatureModels(value: unknown): ByokFeatureModels | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: ByokFeatureModels = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!isByokModelKey(key) || typeof raw !== "string" || raw.length > 300) return null;
    const model = raw.trim();
    if (model) result[key] = model;
  }
  return result;
}

export function surfaceForModelKey(modelKey: ByokModelKey): AiSurface {
  const definition = AI_SURFACE_DEFINITIONS.find((entry) => entry.modelKeys.includes(modelKey));
  if (!definition) throw new Error(`No AI surface for model key ${modelKey}`);
  return definition.id;
}

/** Chains and routines are automations even if they run the same agent. */
export function surfaceForAgentRun(run: {
  chain_id?: string | null;
  routine_id?: string | null;
}): Extract<AiSurface, "agent" | "automations"> {
  return run.chain_id || run.routine_id ? "automations" : "agent";
}
