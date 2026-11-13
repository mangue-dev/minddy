/**
 * The instance model configuration as a FILE (MIN-829): what “Export” writes
 * and “Import” reads, so one instance can be set up like another.
 *
 * Shared by the admin screen (preview of an import) and the server (which
 * re-parses and validates before writing): no server-only import here.
 *
 * The file is versioned JSON. `version` says which shape the file has. An
 * OLDER file goes through `UPGRADES` up to the current shape; a NEWER one is
 * refused, since this release cannot know what its extra fields mean.
 *
 * An import REPLACES the configuration: a setting the file does not carry
 * returns to its default. Applying a file therefore gives the instance
 * exactly what the exporting one had, never a mix of both.
 */
import {
  AI_MODEL_CONFIG_FIELDS,
  ASSISTANT_REASONING_CONFIG_KEY,
} from "@/lib/ai-model-config";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { DECISION_ENGINE_CONFIG_KEY, isDecisionEngine } from "@/lib/decision-engine";

export const MODEL_CONFIG_FILE_FORMAT = "minddy.instance-models";
/**
 * 2 (MIN-954): one model per role, with no categories, per-task models,
 * routing shortcuts or recommended models.
 */
export const MODEL_CONFIG_FILE_VERSION = 2;

/** A model choice. */
export interface ModelChoice {
  model: string;
}

export interface ModelConfigFile {
  format: typeof MODEL_CONFIG_FILE_FORMAT;
  version: number;
  exportedAt: string;
  /** The role models that are set, by `app_config` key. */
  tasks: Record<string, ModelChoice>;
  reasoningLevel: string | null;
  /**
   * What answers decisions, `model` or `llm` (MIN-980); absent or null is the
   * default. Optional: a version 2 file written before it still imports.
   */
  decisionEngine?: string | null;
  /** Per-provider defaults for personal keys, by `app_config` key. */
  providerDefaults: Record<string, string>;
}

/** Stored values, as `GET /api/admin/app-config` returns them. */
export type ModelConfigValues = Record<string, string | null | undefined>;

/**
 * Every key an import may write: the registry. Counts are instance limits,
 * not model choices: the file neither carries nor resets them.
 */
export const MODEL_CONFIG_FILE_KEYS: string[] = AI_MODEL_CONFIG_FIELDS
  .filter((field) => field.kind !== "count")
  .map((field) => field.key);

const TASK_FIELDS = AI_MODEL_CONFIG_FIELDS.filter((field) => field.kind === "model");
const PROVIDER_FIELDS = AI_MODEL_CONFIG_FIELDS.filter((field) => field.kind === "modelId");

/** The file for the stored values. Only what is set is written. */
export function buildModelConfigFile(
  values: ModelConfigValues,
  now: Date = new Date(),
): ModelConfigFile {
  const tasks: ModelConfigFile["tasks"] = {};
  for (const field of TASK_FIELDS) {
    const model = values[field.key]?.trim();
    if (model) tasks[field.key] = { model };
  }
  const providerDefaults: ModelConfigFile["providerDefaults"] = {};
  for (const field of PROVIDER_FIELDS) {
    const model = values[field.key]?.trim();
    if (model) providerDefaults[field.key] = model;
  }
  return {
    format: MODEL_CONFIG_FILE_FORMAT,
    version: MODEL_CONFIG_FILE_VERSION,
    exportedAt: now.toISOString(),
    tasks,
    reasoningLevel: values[ASSISTANT_REASONING_CONFIG_KEY]?.trim() || null,
    decisionEngine: values[DECISION_ENGINE_CONFIG_KEY]?.trim() || null,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Version 1's category defaults, and the role key each one fills. */
const V1_CATEGORY_ROLES: Record<string, string> = {
  assistant: "assistant_model",
  embeddings: "issue_embedding_model",
};

/**
 * Steps from one file version to the next, keyed by the version they read,
 * so an old export keeps importing.
 *
 * 1 → 2 (MIN-954): a role takes its own task entry, or else its category's
 * default. Every other task and category, the routing shortcuts and the
 * recommended models are left in place, so the import lists them as ignored.
 */
const UPGRADES: Record<number, (file: Record<string, unknown>) => Record<string, unknown>> = {
  1: (file) => {
    const tasks = isRecord(file.tasks) ? { ...file.tasks } : {};
    const categories = isRecord(file.categories) ? { ...file.categories } : {};
    for (const [category, roleKey] of Object.entries(V1_CATEGORY_ROLES)) {
      if (tasks[roleKey] === undefined && categories[category] !== undefined) {
        tasks[roleKey] = categories[category];
        delete categories[category];
      }
    }
    return { ...file, tasks, categories };
  },
};

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

  // Categories are gone (MIN-954): an upgraded file may still carry some.
  if (isRecord(file.categories)) {
    for (const id of Object.keys(file.categories)) ignored.push(`categories.${id}`);
  }

  const tasks = file.tasks ?? {};
  if (!isRecord(tasks)) return fail("tasks must be an object");
  for (const [key, choice] of Object.entries(tasks)) {
    if (!TASK_FIELDS.some((field) => field.key === key)) {
      ignored.push(`tasks.${key}`);
      continue;
    }
    if (!isRecord(choice)) return fail(`${key} must be an object`);
    if (choice.model !== undefined && (typeof choice.model !== "string" || choice.model.length > 300)) {
      return fail(`${key}.model must be a model id`);
    }
    if (typeof choice.model === "string") values[key] = choice.model.trim();
    if (choice.suffix !== undefined) ignored.push(`tasks.${key}.suffix`);
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

  const engine = file.decisionEngine ?? null;
  if (engine !== null) {
    if (!isDecisionEngine(engine)) return fail("decisionEngine must be model or llm");
    values[DECISION_ENGINE_CONFIG_KEY] = engine;
  }

  // The admin no longer sets the picker's shortlist (MIN-954).
  if (file.recommendedModels !== undefined && file.recommendedModels !== null) ignored.push("recommendedModels");

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
