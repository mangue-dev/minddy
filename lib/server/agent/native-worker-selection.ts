import "server-only";
import { getServiceClient } from "@/lib/supabase-service";
import { isLiveAgentEngine, isNativeAgentEngine, type LiveAgentEngine } from "@/lib/agent-engines";
import { nativePrototypeEnabledFor } from "./native-prototype/access";
import { listNativeConnections } from "./native-agent-credentials";

export class NativeWorkerUnavailableError extends Error {
  constructor(readonly code: "private_prototype_unavailable" | "reconnect_required") {
    super(code);
    this.name = "NativeWorkerUnavailableError";
  }
}

/** Only metadata is read here; busy connections remain selectable and queue at execution. */
export async function resolveWorkerHarness(userId: string, frozen?: {
  agent_engine: string; native_connection_id?: string | null; native_connection_generation?: number | null;
}) {
  let engine: LiveAgentEngine;
  if (frozen) {
    if (!isLiveAgentEngine(frozen.agent_engine)) throw new NativeWorkerUnavailableError("reconnect_required");
    engine = frozen.agent_engine;
  } else {
    const { data, error } = await getServiceClient().from("user_agent_preferences")
      .select("default_engine").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Unable to read account worker harness");
    const saved = data?.default_engine ?? "opencode";
    if (!isLiveAgentEngine(saved)) throw new NativeWorkerUnavailableError("reconnect_required");
    engine = saved;
  }
  if (!isNativeAgentEngine(engine)) return { engine: "opencode" as const };
  if (!nativePrototypeEnabledFor(userId)) throw new NativeWorkerUnavailableError("private_prototype_unavailable");
  const row = (await listNativeConnections(userId)).find((item) => item.engine === engine);
  if (!row || row.status !== "connected" || row.stopRequired ||
      (frozen && (row.id !== frozen.native_connection_id || row.generation !== frozen.native_connection_generation))) {
    throw new NativeWorkerUnavailableError("reconnect_required");
  }
  return { engine, nativeConnectionId: row.id, nativeConnectionGeneration: row.generation };
}
