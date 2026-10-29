import "server-only";

import {
  clearAppConfigValue,
  getAppConfigValues,
  setAppConfigValue,
} from "@/lib/server/app-config";
import {
  AI_MODEL_CONFIG_KEYS,
  categoryMembers,
  getAiConfigField,
  isModelSuffix,
  isModelSuffixKey,
  modelSuffixKey,
  MODEL_SUFFIXES,
} from "@/lib/ai-model-config";
import {
  diffModelConfig,
  MODEL_CONFIG_FILE_KEYS,
  parseModelConfigFile,
  type ModelConfigChange,
  type ModelConfigFileError,
} from "@/lib/ai-model-config-file";
import { parseRecommendedModels } from "@/lib/recommended-models";
import { isReasoningLevel, REASONING_LEVELS } from "@/lib/agent-reasoning";
import { validateDecisionModelChoice } from "@/lib/server/decisions/model-validation";
import { validateCatalogCapabilityChoice } from "@/lib/server/model-capability-validation";

/**
 * Writes of the instance model configuration (MIN-829): the dashboard rows,
 * an imported file and Numo's admin tools all go through here, so a value one
 * of them refuses is refused by all. Callers own the admin check.
 */

/** Error text per decision-model refusal; the dashboard localizes by `code`. */
const DECISION_MODEL_ERRORS = {
  catalog_unavailable: "The decision model catalog is unavailable; the setting was not changed",
  not_a_decision_model: "Model is not a decision model of the platform catalog",
  compatibility_check_failed: "Model failed the decision compatibility check",
} as const;

/** Roomy bound — the longest legitimate value is the recommended-models JSON list. */
const MAX_VALUE_LENGTH = 10_000;

export type AiConfigRefusal = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  reason?: string;
};

export type AiConfigCheck = { ok: true; value: string } | AiConfigRefusal;

/** Every stored value of the registry and its suffixes. */
export function readAiConfigValues(): Promise<Record<string, string | null>> {
  return getAppConfigValues(MODEL_CONFIG_FILE_KEYS);
}

/**
 * Checks one value without writing it. An EMPTY value is always accepted: it
 * clears the row so the default applies again. A recommended-models list must
 * survive the runtime parser — otherwise we would store a value the picker
 * silently replaces with the built-in defaults.
 */
export async function checkAiConfigValue(key: string, value: unknown): Promise<AiConfigCheck> {
  if (!AI_MODEL_CONFIG_KEYS.has(key)) return { ok: false, status: 400, error: "Invalid key" };
  if (typeof value !== "string") return { ok: false, status: 400, error: "Value must be a string" };
  if (value.length > MAX_VALUE_LENGTH) return { ok: false, status: 400, error: "Value too long" };

  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: "" };
  const field = getAiConfigField(key);

  if (field?.kind === "reasoning" && !isReasoningLevel(trimmed)) {
    return {
      ok: false,
      status: 400,
      error: `Reasoning level must be one of: ${REASONING_LEVELS.join(", ")}`,
    };
  }
  // A routing suffix has three legal values; reject typos here instead of
  // letting OpenRouter return 404 on every call.
  if (isModelSuffixKey(key) && !isModelSuffix(trimmed)) {
    return { ok: false, status: 400, error: `Suffix must be one of: ${MODEL_SUFFIXES.join(", ")}` };
  }
  if (field?.kind === "recommended" && parseRecommendedModels(trimmed) === null) {
    return {
      ok: false,
      status: 400,
      error: "Recommended models must be a JSON array with at least one model id",
    };
  }

  // The global decision model (MIN-694) is checked against the decision
  // catalog and probed before it is written: a refused choice must never be
  // stored, or every decision would silently fall back to the LLM.
  if (field?.catalogCapability === "decision") {
    const check = await validateDecisionModelChoice(trimmed);
    if (!check.ok) {
      return {
        ok: false,
        status: check.status,
        error: DECISION_MODEL_ERRORS[check.code],
        code: check.code,
        ...(check.reason ? { reason: check.reason } : {}),
      };
    }
  }

  // Embedding and transcription fields (MIN-717), category defaults
  // included, must name a model of that family in the platform catalog. BYOK
  // provider defaults (`modelId`) live in a namespace this catalog does not
  // describe.
  if (
    field?.kind === "model" &&
    (field.catalogCapability === "embedding" || field.catalogCapability === "transcription")
  ) {
    const check = await validateCatalogCapabilityChoice(trimmed, field.catalogCapability);
    if (!check.ok) {
      return {
        ok: false,
        status: 400,
        error: `Model is not a ${field.catalogCapability} model of the platform catalog`,
        code: check.code,
      };
    }
  }

  return { ok: true, value: trimmed };
}

/**
 * Model emptied = back to the default: delete the row instead of writing the
 * default id, so that the setting follows later product changes.
 */
async function store(key: string, value: string): Promise<void> {
  if (!value) await clearAppConfigValue(key);
  else await setAppConfigValue(key, value);
}

/**
 * A new instance is seeded with rows for some tasks
 * (`20270106091000_initial_data.sql`), equal to their built-in default.
 * Under a category they would read as overrides and hide its default. When a
 * category default is set, a member row equal to the member's own built-in
 * default and without a routing shortcut is released. Those rows can be
 * encrypted, which rules out cleaning them in SQL.
 */
async function releaseSeededMembers(categoryKey: string): Promise<string[]> {
  const category = getAiConfigField(categoryKey)?.categoryDefault;
  if (!category) return [];
  const members = categoryMembers(category);
  const values = await getAppConfigValues(
    members.flatMap((field) => [field.key, modelSuffixKey(field.key)]),
  );
  const seeded = members.filter(
    (field) =>
      values[field.key]?.trim() === field.fallback && !values[modelSuffixKey(field.key)]?.trim(),
  );
  for (const field of seeded) await clearAppConfigValue(field.key);
  return seeded.map((field) => field.key);
}

export type AiConfigWrite =
  | { ok: true; key: string; value: string; released: string[] }
  | AiConfigRefusal;

/** Checks then writes one value. */
export async function writeAiConfigValue(key: string, value: unknown): Promise<AiConfigWrite> {
  const check = await checkAiConfigValue(key, value);
  if (!check.ok) return check;
  await store(key, check.value);
  const released = check.value ? await releaseSeededMembers(key) : [];
  return { ok: true, key, value: check.value, released };
}

export type AiConfigImport =
  | { ok: true; applied: boolean; changes: ModelConfigChange[]; ignored: string[]; upgraded: boolean }
  | { ok: false; status: number; error: ModelConfigFileError | "refused"; detail?: string; key?: string; code?: string };

/**
 * Previews or applies a configuration file. Every changed value is checked
 * BEFORE the first write: a file with one refused model changes nothing.
 */
export async function importAiConfigFile(input: unknown, apply: boolean): Promise<AiConfigImport> {
  const parsed = parseModelConfigFile(input);
  if (!parsed.ok) {
    return {
      ok: false,
      status: parsed.error === "newer_version" ? 409 : 400,
      error: parsed.error,
      ...(parsed.detail ? { detail: parsed.detail } : {}),
    };
  }
  const changes = diffModelConfig(await readAiConfigValues(), parsed.values);
  const summary = { changes, ignored: parsed.ignored, upgraded: parsed.upgraded };
  if (!apply || changes.length === 0) return { ok: true, applied: false, ...summary };

  const checked: Array<{ key: string; value: string }> = [];
  for (const change of changes) {
    const check = await checkAiConfigValue(change.key, change.to ?? "");
    if (!check.ok) {
      return {
        ok: false,
        status: check.status,
        error: "refused",
        detail: check.error,
        key: change.key,
        ...(check.code ? { code: check.code } : {}),
      };
    }
    checked.push({ key: change.key, value: check.value });
  }
  // The file is the whole configuration: no seeded row needs releasing, the
  // file already says which tasks override their category.
  for (const { key, value } of checked) await store(key, value);
  return { ok: true, applied: true, ...summary };
}
