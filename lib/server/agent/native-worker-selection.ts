import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import { isLiveAgentEngine, isNativeAgentEngine, type LiveAgentEngine } from "@/lib/agent-engines";
import { nativePrototypeEnabledFor } from "./native-prototype/access";
import { nativeWorkerModelId, assertNativeWorkerEffort } from "@/lib/native-worker-model";
import { assertNativeModelPreference } from "./native-prototype/model-catalog";
import { normalizeNativeModelPreferences, isNativeModelPreference } from "@/lib/native-agent-models";
import { listNativeConnections } from "./native-agent-credentials";

export class NativeWorkerUnavailableError extends Error {
  constructor(readonly code: "private_prototype_unavailable" | "reconnect_required") {
    super(code);
    this.name = "NativeWorkerUnavailableError";
  }
}

/** Only metadata is read here; busy connections remain selectable and queue at execution. */
export async function resolveWorkerHarness(userId: string, frozen?: {
  agent_engine: string; model?: string | null; native_reasoning_effort?: string | null; native_connection_id?: string | null; native_connection_generation?: number | null;
}, options: { allowReconnectedContinuation?: boolean } = {}) {
  let engine: LiveAgentEngine;
  let nativePreferences: unknown;
  if (frozen) {
    if (!isLiveAgentEngine(frozen.agent_engine)) throw new NativeWorkerUnavailableError("reconnect_required");
    engine = frozen.agent_engine;
  } else {
    const { data, error } = await getServiceClient().from("user_agent_preferences")
      .select("default_engine,native_model_preferences").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Unable to read account worker harness");
    const saved = data?.default_engine ?? "opencode";
    if (!isLiveAgentEngine(saved)) throw new NativeWorkerUnavailableError("reconnect_required");
    engine = saved;
    nativePreferences = data?.native_model_preferences;
  }
  if (!isNativeAgentEngine(engine)) return { engine: "opencode" as const };
  if (!nativePrototypeEnabledFor(userId)) throw new NativeWorkerUnavailableError("private_prototype_unavailable");
  const row = (await listNativeConnections(userId)).find((item) => item.engine === engine);
  // Only explicit cold continuation may create a new run on a newer generation.
  // Execution of an existing run retains its original immutable credential fence.
  const reconnected = options.allowReconnectedContinuation === true && frozen && row &&
    row.id === frozen.native_connection_id && Number.isSafeInteger(frozen.native_connection_generation) &&
    Number(frozen.native_connection_generation) > 0 && row.generation > Number(frozen.native_connection_generation);
  if (!row || row.status !== "connected" || row.stopRequired ||
      (frozen && !reconnected && (row.id !== frozen.native_connection_id || row.generation !== frozen.native_connection_generation))) {
    throw new NativeWorkerUnavailableError("reconnect_required");
  }
  if (!frozen && nativePreferences != null) {
    const saved = (nativePreferences as Record<string, unknown>)[engine];
    if (saved !== undefined && !isNativeModelPreference(engine, saved)) {
      throw new NativeWorkerUnavailableError("private_prototype_unavailable");
    }
  }
  const preference = frozen
    ? { model: nativeWorkerModelId(engine, frozen.model), reasoningEffort: frozen.native_reasoning_effort ?? null }
    : normalizeNativeModelPreferences(nativePreferences)[engine];
  assertNativeWorkerEffort(engine, preference.reasoningEffort);
  if (!frozen) {
    try { await assertNativeModelPreference(userId, engine, preference); }
    catch { throw new NativeWorkerUnavailableError("private_prototype_unavailable"); }
  }
  return { engine, nativeConnectionId: row.id, nativeConnectionGeneration: row.generation,
    nativeModel: preference.model, nativeReasoningEffort: preference.reasoningEffort };
}
