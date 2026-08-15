/**
 * Les surfaces IA qu'un compte peut faire passer sur sa clé BYOK (MIN-366).
 * Ce module reste pur : l'API, les réglages client et le runtime serveur
 * partagent exactement les mêmes identifiants et les mêmes valeurs par défaut.
 */

export const AI_SURFACES = ["agent", "assistant", "automations", "voice", "feedback"] as const;

export type AiSurface = (typeof AI_SURFACES)[number];

/** Une clé existante ou nouvellement créée couvre tout tant que l'user ne décoche rien. */
export const DEFAULT_BYOK_SURFACES: AiSurface[] = [...AI_SURFACES];

/**
 * Les types d'appel dont le modèle peut différer. Ils correspondent aux vrais
 * réglages plateforme dans app_config ; OpenRouter BYOK peut donc reprendre la
 * valeur Minddy du même nom sans table de correspondance fragile.
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
  // Le modèle agent et son raisonnement ont déjà leur groupe dédié juste sous
  // les surfaces dans /settings ; on ne rend pas deux contrôles concurrents.
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

/** Clé app_config du modèle pré-sélectionné pour un provider natif. */
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
 * Normalise la map de modèles envoyée par le compte. Une chaîne vide efface le
 * choix et laisse le défaut admin gagner ; les clés inconnues sont refusées.
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

/** Les chaînes et routines sont des automatisations même si elles exécutent le même agent. */
export function surfaceForAgentRun(run: {
  chain_id?: string | null;
  routine_id?: string | null;
}): Extract<AiSurface, "agent" | "automations"> {
  return run.chain_id || run.routine_id ? "automations" : "agent";
}
