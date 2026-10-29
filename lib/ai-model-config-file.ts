/**
 * The instance model configuration as a FILE (MIN-829): what “Export” writes
 * and “Import” reads, so one instance can be set up like another.
 *
 * Shared by the admin screen (preview of an import) and the server (which
 * re-parses and validates before writing): no server-only import here.
 *
 * The file is versioned JSON rather than CSV: the recommended models are a
 * list and the categories carry their overrides, neither of which survives a
 * flat table. `version` says which shape the file has. An OLDER file goes
 * through `UPGRADES` up to the current shape; a NEWER one is refused, since
 * this release cannot know what its extra fields mean.
 *
 * An import REPLACES the configuration: a setting the file does not carry
 * returns to its default. Applying a file therefore gives the instance
 * exactly what the exporting one had, never a mix of both.
 */
import {
  AI_MODEL_CATEGORY_IDS,
  AI_MODEL_CONFIG_FIELDS,
  ASSISTANT_REASONING_CONFIG_KEY,
  categoryModelKey,
  isModelSuffix,
  isSuffixableField,
  modelSuffixKey,
  type AiModelCategoryId,
} from "@/lib/ai-model-config";
import { isReasoningLevel } from "@/lib/agent-reasoning";

export const MODEL_CONFIG_FILE_FORMAT = "minddy.instance-models";
export const MODEL_CONFIG_FILE_VERSION = 1;

/** A model choice: the id, the OpenRouter routing shortcut, or both. */
export interface ModelChoice {
  model?: string;
  suffix?: string;
}

export interface ModelConfigFile {
  format: typeof MODEL_CONFIG_FILE_FORMAT;
  version: number;
  exportedAt: string;
  /** Category defaults that are set. */
  categories: Partial<Record<AiModelCategoryId, ModelChoice>>;
  /** Task overrides and standalone tasks that are set, by `app_config` key. */
  tasks: Record<string, ModelChoice>;
  reasoningLevel: string | null;
  /** `null` follows the product's built-in list. */
  recommendedModels: string[] | null;
  /** Per-provider defaults for personal keys, by `app_config` key. */
  providerDefaults: Record<string, string>;
}

/** Stored values, as `GET /api/admin/app-config` returns them. */
export type ModelConfigValues = Record<string, string | null | undefined>;

const RECOMMENDED_KEY = "recommended_models";

/** Every key an import may write: the registry and its suffixes. */
export const MODEL_CONFIG_FILE_KEYS: string[] = [
  ...AI_MODEL_CONFIG_FIELDS.map((field) => field.key),
  ...AI_MODEL_CONFIG_FIELDS.filter(isSuffixableField).map((field) => modelSuffixKey(field.key)),
];

const TASK_FIELDS = AI_MODEL_CONFIG_FIELDS.filter(
  (field) => field.kind === "model" && !field.categoryDefault,
);
const PROVIDER_FIELDS = AI_MODEL_CONFIG_FIELDS.filter((field) => field.kind === "modelId");

function choiceOf(values: ModelConfigValues, key: string): ModelChoice | null {
  const model = values[key]?.trim();
  const suffix = values[modelSuffixKey(key)]?.trim();
  if (!model && !suffix) return null;
  return { ...(model ? { model } : {}), ...(suffix ? { suffix } : {}) };
}

/** The file for the stored values. Only what is set is written. */
export function buildModelConfigFile(
  values: ModelConfigValues,
  now: Date = new Date(),
): ModelConfigFile {
  const categories: ModelConfigFile["categories"] = {};
  for (const id of AI_MODEL_CATEGORY_IDS) {
    const choice = choiceOf(values, categoryModelKey(id));
    if (choice) categories[id] = choice;
  }
  const tasks: ModelConfigFile["tasks"] = {};
  for (const field of TASK_FIELDS) {
    const choice = choiceOf(values, field.key);
    if (choice) tasks[field.key] = choice;
  }
  const providerDefaults: ModelConfigFile["providerDefaults"] = {};
  for (const field of PROVIDER_FIELDS) {
    const model = values[field.key]?.trim();
    if (model) providerDefaults[field.key] = model;
  }
  let recommendedModels: string[] | null = null;
  try {
    const parsed: unknown = JSON.parse(values[RECOMMENDED_KEY] ?? "null");
    if (Array.isArray(parsed)) recommendedModels = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // A hand-written row the runtime ignores is not exported either.
  }
  return {
    format: MODEL_CONFIG_FILE_FORMAT,
    version: MODEL_CONFIG_FILE_VERSION,
    exportedAt: now.toISOString(),
    categories,
    tasks,
    reasoningLevel: values[ASSISTANT_REASONING_CONFIG_KEY]?.trim() || null,
    recommendedModels,
    providerDefaults,
  };
}

export type ModelConfigFileError =
  | "invalid_json"
  | "not_a_model_config"
  | "newer_version"
  | "invalid_value";

export type ParsedModelConfigFile =
  | {
      ok: true;
      /** The value of EVERY importable key; `""` returns it to its default. */
      values: Record<string, string>;
      version: number;
      /** The file was written by an earlier release and upgraded on read. */
      upgraded: boolean;
      /** Entries this release does not know, left out of the import. */
      ignored: string[];
    }
  | { ok: false; error: ModelConfigFileError; detail?: string };

/**
 * Steps from one file version to the next, keyed by the version they read.
 * Version 1 is the first: the list starts empty and grows when a release
 * renames or regroups a setting, so an old export keeps importing.
 */
const UPGRADES: Record<number, (file: Record<string, unknown>) => Record<string, unknown>> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readChoice(
  raw: unknown,
  key: string,
  suffixable: boolean,
  out: Record<string, string>,
): string | null {
  if (!isRecord(raw)) return `${key} must be an object`;
  const model = raw.model;
  const suffix = raw.suffix;
  if (model !== undefined && (typeof model !== "string" || model.length > 300)) {
    return `${key}.model must be a model id`;
  }
  if (suffix !== undefined) {
    if (!suffixable || typeof suffix !== "string" || !isModelSuffix(suffix.trim())) {
      return `${key}.suffix is not a routing shortcut`;
    }
    out[modelSuffixKey(key)] = suffix.trim();
  }
  if (typeof model === "string") out[key] = model.trim();
  return null;
}

/** Reads a file (its text, or its already-parsed JSON). */
export function parseModelConfigFile(input: string | unknown): ParsedModelConfigFile {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, error: "invalid_json" };
    }
  }
  if (!isRecord(raw) || raw.format !== MODEL_CONFIG_FILE_FORMAT) {
    return { ok: false, error: "not_a_model_config" };
  }
  const version = raw.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "not_a_model_config" };
  }
  if (version > MODEL_CONFIG_FILE_VERSION) return { ok: false, error: "newer_version" };

  let file = raw;
  for (let step = version; step < MODEL_CONFIG_FILE_VERSION; step++) {
    const upgrade = UPGRADES[step];
    if (!upgrade) return { ok: false, error: "not_a_model_config" };
    file = upgrade(file);
  }

  const values: Record<string, string> = Object.fromEntries(
    MODEL_CONFIG_FILE_KEYS.map((key) => [key, ""]),
  );
  const ignored: string[] = [];
  const fail = (detail: string): ParsedModelConfigFile => ({ ok: false, error: "invalid_value", detail });

  const categories = file.categories ?? {};
  if (!isRecord(categories)) return fail("categories must be an object");
  for (const [id, choice] of Object.entries(categories)) {
    if (!(AI_MODEL_CATEGORY_IDS as string[]).includes(id)) {
      ignored.push(`categories.${id}`);
      continue;
    }
    const error = readChoice(choice, categoryModelKey(id as AiModelCategoryId), true, values);
    if (error) return fail(error);
  }

  const tasks = file.tasks ?? {};
  if (!isRecord(tasks)) return fail("tasks must be an object");
  for (const [key, choice] of Object.entries(tasks)) {
    const field = TASK_FIELDS.find((candidate) => candidate.key === key);
    if (!field) {
      ignored.push(`tasks.${key}`);
      continue;
    }
    const error = readChoice(choice, key, isSuffixableField(field), values);
    if (error) return fail(error);
  }

  const providers = file.providerDefaults ?? {};
  if (!isRecord(providers)) return fail("providerDefaults must be an object");
  for (const [key, model] of Object.entries(providers)) {
    if (!PROVIDER_FIELDS.some((field) => field.key === key)) {
      ignored.push(`providerDefaults.${key}`);
      continue;
    }
    if (typeof model !== "string" || model.length > 300) return fail(`providerDefaults.${key} must be a model id`);
    values[key] = model.trim();
  }

  const reasoning = file.reasoningLevel ?? null;
  if (reasoning !== null) {
    if (!isReasoningLevel(reasoning)) return fail("reasoningLevel is not a reasoning level");
    values[ASSISTANT_REASONING_CONFIG_KEY] = reasoning;
  }

  const recommended = file.recommendedModels ?? null;
  if (recommended !== null) {
    if (
      !Array.isArray(recommended) ||
      recommended.length === 0 ||
      recommended.some((id) => typeof id !== "string" || !id.trim() || id.length > 300)
    ) {
      return fail("recommendedModels must be a non-empty list of model ids");
    }
    values[RECOMMENDED_KEY] = JSON.stringify([...new Set(recommended.map((id: string) => id.trim()))]);
  }

  return { ok: true, values, version, upgraded: version < MODEL_CONFIG_FILE_VERSION, ignored };
}

export interface ModelConfigChange {
  key: string;
  /** `null` when the setting is at its default. */
  from: string | null;
  to: string | null;
}

/** What applying `next` would change, key by key, in registry order. */
export function diffModelConfig(
  current: ModelConfigValues,
  next: Record<string, string>,
): ModelConfigChange[] {
  const changes: ModelConfigChange[] = [];
  for (const key of MODEL_CONFIG_FILE_KEYS) {
    const from = current[key]?.trim() || null;
    const to = next[key]?.trim() || null;
    if (from !== to) changes.push({ key, from, to });
  }
  return changes;
}
