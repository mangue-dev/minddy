import { isNativeModelId, isNativeReasoningEffort } from "./native-agent-models";
import type { NativeHarness } from "./native-agent-prototype";

/** Native model IDs are opaque CLI identifiers, never provider API routes. */
export function nativeWorkerModel(engine: NativeHarness, model: string | null | undefined): string {
  return `${engine}/${model ?? "default"}`;
}

/** Decode only the immutable model belonging to this native engine. */
export function nativeWorkerModelId(engine: NativeHarness, model: unknown): string | null {
  if (model == null || model === `${engine}/default`) return null;
  if (typeof model !== "string" || !model.startsWith(`${engine}/`)) throw new Error("Invalid frozen native model");
  const id = model.slice(engine.length + 1);
  if (!isNativeModelId(id)) throw new Error("Invalid frozen native model");
  return id;
}

export function assertNativeWorkerEffort(engine: NativeHarness, effort: unknown): asserts effort is string | null | undefined {
  if (effort != null && !isNativeReasoningEffort(engine, effort)) throw new Error("Invalid frozen native reasoning effort");
}
