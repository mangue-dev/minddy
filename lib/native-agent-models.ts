import type { NativeHarness } from "./native-agent-prototype";

export type NativeModelPreference = { model: string | null; reasoningEffort: string | null };
export type NativeModelPreferences = Record<NativeHarness, NativeModelPreference>;
export type NativeModelOption = {
  id: string;
  displayName: string;
  supportedReasoningEfforts: string[];
  defaultReasoningEffort: string | null;
  isDefault: boolean;
};
export type NativeAgentModelCatalog = {
  engine: NativeHarness;
  models: NativeModelOption[];
  source: "native" | "aliases";
  updatedAt: string | null;
};
const CODEX_EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const CLAUDE_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
export function isNativeModelId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,199}$/.test(value) && value !== "default";
}
export function isNativeReasoningEffort(engine: NativeHarness, value: unknown): value is string {
  return typeof value === "string" && (engine === "codex" ? CODEX_EFFORTS : CLAUDE_EFFORTS).has(value);
}
export function isNativeModelPreference(engine: NativeHarness, value: unknown): value is NativeModelPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === 2 && Object.hasOwn(item, "model") && Object.hasOwn(item, "reasoningEffort") &&
    (item.model === null || isNativeModelId(item.model)) &&
    (item.reasoningEffort === null || isNativeReasoningEffort(engine, item.reasoningEffort));
}
export function normalizeNativeModelPreferences(value: unknown): NativeModelPreferences {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    codex: isNativeModelPreference("codex", item.codex) ? item.codex : { model: null, reasoningEffort: null },
    claude_code: isNativeModelPreference("claude_code", item.claude_code) ? item.claude_code : { model: null, reasoningEffort: null },
  };
}
/** Stable CLI aliases follow Anthropic's current subscription model recommendations. */
export function claudeNativeModelCatalog(): NativeAgentModelCatalog {
  return { engine: "claude_code", source: "aliases", updatedAt: null,
    models: ["sonnet", "opus", "haiku"].map((id) => ({ id, displayName: id === "opus" ? "Opus" : id === "sonnet" ? "Sonnet" : "Haiku", supportedReasoningEfforts: [...CLAUDE_EFFORTS], defaultReasoningEffort: null, isDefault: false })) };
}
/** Only public model identifiers and advertised effort names cross the controller boundary. */
export function parseCodexModels(value: unknown): NativeModelOption[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("Invalid native model catalog");
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid native model catalog");
    const model = item as Record<string, unknown>;
    const id = model.model ?? model.id;
    if (!isNativeModelId(id) || seen.has(id) || typeof model.displayName !== "string" || model.displayName.length < 1 || model.displayName.length > 120 || /[\x00-\x1f\x7f]/.test(model.displayName)) throw new Error("Invalid native model catalog"); // eslint-disable-line no-control-regex
    seen.add(id);
    if (!Array.isArray(model.supportedReasoningEfforts) || model.supportedReasoningEfforts.length > 8) throw new Error("Invalid native model efforts");
    const efforts = model.supportedReasoningEfforts.map((entry: unknown) => typeof entry === "string" ? entry : entry && typeof entry === "object" ? (entry as Record<string, unknown>).reasoningEffort : null);
    if (efforts.some((effort) => !isNativeReasoningEffort("codex", effort)) || new Set(efforts).size !== efforts.length) throw new Error("Invalid native model efforts");
    const defaultEffort = model.defaultReasoningEffort ?? null;
    if (defaultEffort !== null && !efforts.includes(defaultEffort)) throw new Error("Invalid native default effort");
    return { id, displayName: model.displayName, supportedReasoningEfforts: efforts as string[], defaultReasoningEffort: defaultEffort as string | null, isDefault: model.isDefault === true };
  });
}
