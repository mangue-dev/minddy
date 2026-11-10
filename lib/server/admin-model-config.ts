import "server-only";

import {
  clearAppConfigValue,
  getAppConfigValues,
  setAppConfigValue,
} from "@/lib/server/app-config";
import {
  AI_MODEL_CONFIG_FIELDS,
  AI_MODEL_CONFIG_KEYS,
  categoryKeyOf,
  getAiConfigField,
} from "@/lib/ai-model-config";
import {
  diffModelConfig,
  MODEL_CONFIG_FILE_KEYS,
  parseModelConfigFile,
  type ModelConfigChange,
  type ModelConfigFileError,
} from "@/lib/ai-model-config-file";
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

/**
 * Every stored value of the registry and its suffixes, counts included: the
 * models file leaves counts out, the dashboard and the admin tools do not.
 *
 * A role still running on its retired category default (MIN-829) reads as
 * that value (MIN-954): the dashboard, an export and an import's preview show
 * the model the role really runs, and the next save of the role clears the
 * category row.
 */
export async function readAiConfigValues(): Promise<Record<string, string | null>> {
  const counts = AI_MODEL_CONFIG_FIELDS.filter((field) => field.kind === "count").map((field) => field.key);
  const legacy = MODEL_CONFIG_FILE_KEYS.flatMap((key) => {
    const category = categoryKeyOf(key);
    return category ? [category] : [];
  });
  const stored = await getAppConfigValues([...MODEL_CONFIG_FILE_KEYS, ...counts, ...legacy]);
  const values: Record<string, string | null> = {};
  for (const key of [...MODEL_CONFIG_FILE_KEYS, ...counts]) values[key] = stored[key] ?? null;
  for (const key of MODEL_CONFIG_FILE_KEYS) {
    const category = categoryKeyOf(key);
    if (!category || values[key]?.trim() || !stored[category]?.trim()) continue;
    values[key] = stored[category] ?? null;
  }
  return values;
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

  if (field?.kind === "count") {
    const max = field.max ?? Number.MAX_SAFE_INTEGER;
    if (!/^\d+$/.test(trimmed) || Number(trimmed) > max) {
      return { ok: false, status: 400, error: `Value must be a whole number from 0 to ${max}` };
    }
    return { ok: true, value: String(Number(trimmed)) };
  }
  if (field?.kind === "reasoning" && !isReasoningLevel(trimmed)) {
    return {
      ok: false,
      status: 400,
      error: `Reasoning level must be one of: ${REASONING_LEVELS.join(", ")}`,
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

  // Embedding and transcription fields (MIN-717) must name a model of that family in the platform catalog. BYOK
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
 * default id, so that the setting follows later product changes. A role's
 * retired category row (MIN-829) and any routing shortcut are cleared with
 * it, so the role runs exactly what the administrator set, default included
 * (MIN-954).
 */
async function store(key: string, value: string): Promise<void> {
  if (!value) await clearAppConfigValue(key);
  else await setAppConfigValue(key, value);
  // Rows the dashboard no longer sets, so they never linger unseen: the
  // retired category default and the routing shortcuts (MIN-954).
  if (getAiConfigField(key)?.kind !== "model") return;
  const legacy = categoryKeyOf(key);
  for (const row of [`${key}_suffix`, ...(legacy ? [legacy, `${legacy}_suffix`] : [])]) {
    await clearAppConfigValue(row);
  }
}

export type AiConfigWrite =
  | { ok: true; key: string; value: string }
  | AiConfigRefusal;

/** Checks then writes one value. */
export async function writeAiConfigValue(key: string, value: unknown): Promise<AiConfigWrite> {
  const check = await checkAiConfigValue(key, value);
  if (!check.ok) return check;
  await store(key, check.value);
  return { ok: true, key, value: check.value };
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
  for (const { key, value } of checked) await store(key, value);
  return { ok: true, applied: true, ...summary };
}
