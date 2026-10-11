import "server-only";
import { claudeNativeModelCatalog, isNativeModelPreference, parseCodexModels, type NativeAgentModelCatalog, type NativeModelPreference } from "@/lib/native-agent-models";
import type { NativeHarness } from "@/lib/native-agent-prototype";
import { getServiceClient } from "@/lib/supabase-service";
import { listNativeConnections } from "../native-agent-credentials";
import { assertNativePrototypeAccess } from "./access";
import { discoverNativeCodexModels, NativePrototypeError } from "./connections";

/** GET reads metadata only; opening settings never creates a paid allocation. */
export async function nativeModelCatalog(userId: string, engine: NativeHarness): Promise<NativeAgentModelCatalog> {
  assertNativePrototypeAccess(userId);
  if (engine === "claude_code") return claudeNativeModelCatalog();
  const empty: NativeAgentModelCatalog = { engine, models: [], source: "native", updatedAt: null };
  const connection = (await listNativeConnections(userId)).find((item) => item.engine === engine);
  if (!connection || connection.status !== "connected" || connection.stopRequired) return empty;
  const { data, error } = await getServiceClient().from("native_agent_model_catalogs")
    .select("models,updated_at,connection_id,connection_generation").eq("user_id", userId).eq("engine", engine).maybeSingle();
  if (error) throw new NativePrototypeError("test_failed");
  if (!data || data.connection_id !== connection.id || data.connection_generation !== connection.generation) return empty;
  return { ...empty, models: parseCodexModels(data.models), updatedAt: data.updated_at };
}
export async function refreshNativeModelCatalog(userId: string, engine: NativeHarness) {
  assertNativePrototypeAccess(userId);
  if (engine === "codex") await discoverNativeCodexModels(userId);
  return nativeModelCatalog(userId, engine);
}
/** Catalog membership is not an entitlement guarantee; inference remains authoritative. */
export async function assertNativeModelPreference(userId: string, engine: NativeHarness, preference: NativeModelPreference) {
  if (!isNativeModelPreference(engine, preference)) throw new NativePrototypeError("profile_invalid");
  if (preference.model === null && preference.reasoningEffort === null) return;
  const catalog = await nativeModelCatalog(userId, engine);
  const selected = preference.model === null ? catalog.models.find((item) => item.isDefault) : catalog.models.find((item) => item.id === preference.model);
  if (!selected || (preference.reasoningEffort !== null && !selected.supportedReasoningEfforts.includes(preference.reasoningEffort))) throw new NativePrototypeError("profile_invalid");
}
